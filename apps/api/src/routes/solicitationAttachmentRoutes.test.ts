import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { request as httpRequest } from "node:http";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AttachmentUploadBatch } from "../entities/AttachmentUploadBatch.js";
import { SolicitationAttachment } from "../entities/SolicitationAttachment.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User, UserRole } from "../entities/User.js";
import { MAX_ATTACHMENT_REQUEST_BYTES } from "../middleware/attachmentMultipart.js";
import { AttachmentTransactionUncertainError, type SolicitationAttachmentRepository } from "../repositories/solicitationAttachmentRepository.js";
import type { SessionRepository } from "../services/sessionService.js";
import type { UserRepository } from "../services/userService.js";
import type { UserManagementRepository } from "../services/userManagementService.js";
import { AttachmentStorageError } from "../storage/attachmentStorage.js";
import { createLocalAttachmentStorage } from "../storage/localAttachmentStorage.js";

const origin = "http://localhost:5173";
const cookie = `fixit_session=${"a".repeat(43)}`;
const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const maintainerId = "33333333-3333-4333-8333-333333333333";
let server: Server | undefined;
let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "fixit-attachment-http-"));
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((done, reject) => server!.close((error) => error ? reject(error) : done()));
  server = undefined;
  if (!resolve(root).startsWith(join(resolve(tmpdir()), "fixit-attachment-http-"))) throw new Error("Unsafe test cleanup");
  await fs.rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function image(format: "png" | "jpeg" | "webp" = "png") {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).toFormat(format).toBuffer();
}

async function setup(role = UserRole.CLIENTE) {
  const user = Object.assign(new User(), { id: ownerId, fullName: "Ana Silva", email: "ana@example.edu", role, isActive: true });
  const states = [
    { id: 1, solicitanteId: ownerId, responsavelId: maintainerId },
    { id: 2, solicitanteId: otherId, responsavelId: maintainerId },
  ];
  let attachments: SolicitationAttachment[] = [];
  let batches: AttachmentUploadBatch[] = [];
  let tail = Promise.resolve();
  const faults: ("lost" | "offline")[] = [];
  const saveMetadata = vi.fn(async () => undefined);
  // Serviço e filesystem reais; PostgreSQL/transações são simulados neste teste HTTP.
  const repository: SolicitationAttachmentRepository = {
    findSolicitation: async (id) => states.find((entry) => entry.id === id) ?? null,
    listBySolicitation: async (id) => attachments.filter((entry) => entry.solicitacaoId === id),
    findAttachment: async (id, attachmentId) => attachments.find((entry) => entry.solicitacaoId === id && entry.id === attachmentId) ?? null,
    async transaction(work) {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((done) => { release = done; });
      await previous;
      try {
        const fault = faults.shift();
        if (fault === "offline") throw new Error("Database offline");
        const pendingAttachments = [...attachments];
        const pendingBatches = [...batches];
        const result = await work({
          findSolicitationForUpdate: async (id) => states.find((entry) => entry.id === id) ?? null,
          findBatch: async (identity) => pendingBatches.find((batch) => batch.solicitacaoId === identity.solicitacaoId && batch.autorId === identity.autorId && batch.idempotencyKey === identity.idempotencyKey) ?? null,
          listBatch: async (id) => pendingAttachments.filter((entry) => entry.uploadBatchId === id),
          countConfirmed: async (id) => pendingAttachments.filter((entry) => entry.solicitacaoId === id).length,
          createBatch: async (entry) => {
            const batch = Object.assign(new AttachmentUploadBatch(), entry, { id: randomUUID(), criadoEm: new Date() });
            pendingBatches.push(batch);
            return batch;
          },
          createAttachments: async (entries) => {
            await saveMetadata();
            const saved = entries.map((entry) => Object.assign(new SolicitationAttachment(), entry, { id: randomUUID(), criadoEm: new Date() }));
            pendingAttachments.push(...saved);
            return saved;
          },
        });
        attachments = pendingAttachments;
        batches = pendingBatches;
        if (fault === "lost") throw new AttachmentTransactionUncertainError();
        return result;
      } finally { release(); }
    },
  };
  const users: UserRepository = {
    create: (input) => Object.assign(new User(), input), findOneBy: async () => null, save: async (entry) => entry,
  };
  const sessions: SessionRepository = {
    create: (input) => Object.assign(new AuthSession(), input), save: async (entry) => entry,
    findOneByTokenHash: async () => Object.assign(new AuthSession(), { userId: user.id, expiresAt: null, revokedAt: null }),
    findUserById: async () => user,
  };
  const management: UserManagementRepository = {
    list: async () => ({ users: [], totalItems: 0 }), transaction: async () => { throw new Error("Not used"); },
  };
  const storage = createLocalAttachmentStorage(root);
  const prepare = vi.spyOn(storage, "prepare");
  const read = vi.spyOn(storage, "read");
  server = createApp(async () => undefined, users, sessions, management, { secureCookies: false, webOrigin: origin },
    undefined, undefined, undefined, { repository, storage }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const base = `http://127.0.0.1:${address.port}`;
  const url = `${base}/api/solicitations/1/attachments`;
  async function post(buffers?: Buffer[], key = randomUUID(), headers: Record<string, string> = { Cookie: cookie, Origin: origin }, field = "images") {
    const form = new FormData();
    (buffers ?? [await image()]).forEach((bytes, index) => form.append(field, new Blob([new Uint8Array(bytes)], { type: "image/png" }), `foto-${index}.png`));
    return fetch(url, { method: "POST", headers: { "Idempotency-Key": key, ...headers }, body: form });
  }
  const get = (path = url, headers: Record<string, string> = { Cookie: cookie }) => fetch(path, { headers });
  return { user, states, storage, prepare, read, repository, saveMetadata, faults, base, url, post, get, attachments: () => attachments };
}

describe("US009 attachment HTTP integration", () => {
  it.each(Object.values(UserRole))("allows requester upload as %s with public metadata only", async (role) => {
    const c = await setup(role);
    const response = await c.post();
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ nomeOriginal: "foto-0.png", mimeType: "image/png", contentUrl: expect.stringMatching(/^\/api\/solicitations\/1\/attachments\/[a-f0-9-]+\/content$/) });
    expect(body.data[0]).not.toHaveProperty("storageKey");
    expect(JSON.stringify(body)).not.toContain(root);
    expect(c.attachments()[0].autorId).toBe(ownerId);
  });

  it.each(["png", "jpeg", "webp"] as const)("serves %s content by detected type, ignoring the declared filename/MIME", async (format) => {
    const c = await setup();
    const bytes = await image(format);
    const upload = await c.post([bytes]);
    expect(upload.status).toBe(201);
    const [entry] = (await upload.json()).data;
    const response = await c.get(`${c.base}${entry.contentUrl}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(`image/${format}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("lists only public metadata", async () => {
    const c = await setup();
    const uploaded = await c.post();
    const expected = await uploaded.json();
    const response = await c.get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  });

  it.each(["upload", "list", "content"])("requires a session for %s", async (operation) => {
    const c = await setup();
    const response = operation === "upload" ? await c.post(undefined, randomUUID(), { Origin: origin }) :
      await c.get(operation === "list" ? c.url : `${c.url}/${randomUUID()}/content`, {});
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(c.prepare).not.toHaveBeenCalled();
    expect(c.read).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://untrusted.example"])("requires the allowed Origin: %s", async (value) => {
    const c = await setup();
    const headers: Record<string, string> = { Cookie: cookie };
    if (value) headers.Origin = value;
    const response = await c.post(undefined, randomUUID(), headers);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it.each(Object.values(UserRole))("denies non-requester upload even as %s", async (role) => {
    const c = await setup(role);
    c.user.id = otherId;
    const response = await c.post();
    expect(response.status).toBe(403);
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it.each([
    [UserRole.CLIENTE, ownerId, 200], [UserRole.CLIENTE, otherId, 403],
    [UserRole.MANUTENTOR, maintainerId, 200], [UserRole.MANUTENTOR, otherId, 403],
    [UserRole.GESTOR, otherId, 200],
  ] as const)("enforces read scope for %s %s", async (role, id, status) => {
    const c = await setup();
    const uploaded = await c.post();
    const [entry] = (await uploaded.json()).data;
    c.user.role = role;
    c.user.id = id;
    const list = await c.get();
    const content = await c.get(`${c.base}${entry.contentUrl}`);
    expect(list.status).toBe(status);
    expect(content.status).toBe(status);
  });

  it("checks that an attachment belongs to the solicitation in the URL", async () => {
    const c = await setup();
    const response = await c.post();
    const [entry] = (await response.json()).data;
    c.user.role = UserRole.GESTOR;
    const swapped = await c.get(`${c.base}/api/solicitations/2/attachments/${entry.id}/content`);
    expect(swapped.status).toBe(404);
    expect((await swapped.json()).error.code).toBe("ATTACHMENT_NOT_FOUND");
    expect(c.read).not.toHaveBeenCalled();
  });

  it.each([Buffer.from("not an image"), Buffer.from("GIF89a")])("rejects invalid image bytes", async (bytes) => {
    const c = await setup();
    const response = await c.post([bytes]);
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields.images).toEqual(expect.any(String));
    expect(c.attachments()).toHaveLength(0);
  });

  it("rejects a corrupt image and compensates earlier images of the batch", async () => {
    const c = await setup();
    const valid = await image();
    const response = await c.post([valid, valid.subarray(0, 35)]);
    expect(response.status).toBe(422);
    expect(c.attachments()).toHaveLength(0);
    expect(await fs.readdir(join(root, "temporary"))).toEqual([]);
    expect(await fs.readdir(join(root, "permanent"))).toEqual([]);
  });

  it("rejects an image above 5,000,000 bytes before storage", async () => {
    const c = await setup();
    const response = await c.post([Buffer.alloc(5_000_001)]);
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("ATTACHMENT_TOO_LARGE");
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it("accepts a valid JPEG of exactly 5,000,000 bytes", async () => {
    const c = await setup();
    const original = await image("jpeg");
    // Segmentos COM são parte válida de JPEG; preenche sem exceder seu limite
    // de 65.535 bytes por segmento, preservando o restante da imagem real.
    const chunks = [original.subarray(0, 2)];
    let remaining = 5_000_000 - original.length;
    while (remaining) {
      let size = Math.min(65_537, remaining);
      if (remaining - size > 0 && remaining - size < 4) size -= 4 - (remaining - size);
      const comment = Buffer.alloc(size);
      comment[0] = 0xff;
      comment[1] = 0xfe;
      comment.writeUInt16BE(size - 2, 2);
      chunks.push(comment);
      remaining -= size;
    }
    chunks.push(original.subarray(2));
    const response = await c.post([Buffer.concat(chunks)]);
    expect(response.status).toBe(201);
    const [entry] = (await response.json()).data;
    expect(entry.tamanhoBytes).toBe(5_000_000);
    expect(entry.mimeType).toBe("image/jpeg");
  });

  it.each([0, 6])("rejects a batch of %s files", async (count) => {
    const c = await setup();
    const response = await c.post(Array.from({ length: count }, () => Buffer.from("invalid")));
    expect(response.status).toBe(422);
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it("allows five images and replays the same key before capacity checking", async () => {
    const c = await setup();
    const key = randomUUID();
    const buffers = Array.from({ length: 5 }, () => Buffer.from([]));
    for (let i = 0; i < buffers.length; i++) buffers[i] = await image();
    const first = await c.post(buffers, key);
    expect(first.status).toBe(201);
    const body = await first.json();
    const replay = await c.post(buffers, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(body);
    expect(c.prepare).toHaveBeenCalledTimes(5);
    const extra = await c.post();
    expect(extra.status).toBe(422);
    expect((await extra.json()).error.fields.images).toContain("5 imagens");
  });

  it("rejects a reused key with different bytes", async () => {
    const c = await setup();
    const key = randomUUID();
    expect((await c.post(undefined, key)).status).toBe(201);
    const response = await c.post([await image("jpeg")], key);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ATTACHMENT_IDEMPOTENCY_CONFLICT");
    expect(c.attachments()).toHaveLength(1);
  });

  it.each([undefined, "invalid", `${randomUUID()},${randomUUID()}`])("rejects invalid Idempotency-Key: %s", async (key) => {
    const c = await setup();
    const form = new FormData();
    const headers: Record<string, string> = { Cookie: cookie, Origin: origin };
    if (key) headers["Idempotency-Key"] = key;
    const response = await fetch(c.url, { method: "POST", headers, body: form });
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields.idempotencyKey).toEqual(expect.any(String));
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it("rejects extra fields instead of trusting requester IDs in the body", async () => {
    const c = await setup();
    const form = new FormData();
    form.append("solicitanteId", otherId);
    const response = await fetch(c.url, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Idempotency-Key": randomUUID() }, body: form });
    expect(response.status).toBe(422);
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it("rejects files outside the images field", async () => {
    const c = await setup();
    expect((await c.post(undefined, randomUUID(), undefined, "files")).status).toBe(422);
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it.each(["not multipart", "missing boundary", "truncated"])("rejects malformed body: %s", async (kind) => {
    const c = await setup();
    const contentType = kind === "not multipart" ? "text/plain" : kind === "missing boundary" ? "multipart/form-data" : "multipart/form-data; boundary=x";
    const body = kind === "truncated" ? '--x\r\nContent-Disposition: form-data; name="images"; filename="x.png"\r\n\r\npartial' : "invalid";
    const response = await fetch(c.url, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Idempotency-Key": randomUUID(), "Content-Type": contentType }, body });
    expect(response.status).toBe(kind === "not multipart" ? 415 : 422);
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it("caps the total request size, even for chunked bodies without Content-Length", async () => {
    const c = await setup();
    const status = await new Promise<number>((done, reject) => {
      const request = httpRequest(c.url, { method: "POST", headers: {
        Cookie: cookie, Origin: origin, "Idempotency-Key": randomUUID(), "Content-Type": "multipart/form-data; boundary=x",
      } }, (response) => { response.resume(); response.on("end", () => done(response.statusCode!)); });
      request.on("error", reject);
      // Preamble exercises the overall cap independently of per-file limits.
      const chunk = Buffer.alloc(100_000, 97);
      for (let sent = 0; sent <= MAX_ATTACHMENT_REQUEST_BYTES; sent += chunk.length) request.write(chunk);
      request.end("\r\n--x--\r\n");
    });
    expect(status).toBe(413);
    expect(c.prepare).not.toHaveBeenCalled();
  });

  it("does not save files when the client interrupts a multipart upload", async () => {
    const c = await setup();
    const received = once(server!, "request");
    const request = httpRequest(c.url, { method: "POST", headers: {
      Cookie: cookie, Origin: origin, "Idempotency-Key": randomUUID(), "Content-Type": "multipart/form-data; boundary=x",
    } });
    request.on("error", () => undefined);
    request.write('--x\r\nContent-Disposition: form-data; name="images"; filename="x.png"\r\n\r\npartial');
    const [incoming] = await received;
    const closed = new Promise<void>((done) => incoming.once("close", done));
    request.destroy();
    await closed;
    expect(c.prepare).not.toHaveBeenCalled();
    expect(c.attachments()).toHaveLength(0);
  });

  it("allows CORS preflight for the idempotency header", async () => {
    const c = await setup();
    const response = await fetch(c.url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,idempotency-key" } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("Idempotency-Key");
  });

  it.each(["storage", "metadata"])("does not disclose internal details on %s failure", async (stage) => {
    const c = await setup();
    if (stage === "storage") c.prepare.mockRejectedValueOnce(new AttachmentStorageError("prepare", undefined, { cause: new Error(`${root}/secret`) }));
    else c.saveMetadata.mockRejectedValueOnce(new Error(`${root}/database-secret`));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await c.post();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe(stage === "storage" ? "ATTACHMENT_SAVE_FAILED" : "INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(body)).not.toContain(root);
    expect(c.attachments()).toHaveLength(0);
  });

  it("reports uncertain outcomes separately and preserves files", async () => {
    const c = await setup();
    c.faults.push("lost", "offline");
    const key = randomUUID();
    const response = await c.post(undefined, key);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ATTACHMENT_UPLOAD_UNCERTAIN");
    expect(await fs.readdir(join(root, "permanent"))).toHaveLength(1);
    const retry = await c.post(undefined, key);
    expect(retry.status).toBe(201);
    expect(c.prepare).toHaveBeenCalledOnce();
  });

  it("does not expose storage keys if content reading fails", async () => {
    const c = await setup();
    const upload = await c.post();
    const [entry] = (await upload.json()).data;
    c.read.mockRejectedValueOnce(new AttachmentStorageError("read", "secret-key", { cause: new Error(root) }));
    const response = await c.get(`${c.base}${entry.contentUrl}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "ATTACHMENT_READ_FAILED", message: "Não foi possível carregar a imagem." } });
  });

  it("does not publish the upload directory as a static route", async () => {
    const c = await setup();
    await c.post();
    const key = c.attachments()[0].storageKey;
    expect((await c.get(`${c.base}/uploads/permanent/${key}`, {})).status).toBe(404);
  });

  it("validates both identifiers and returns 404 for absent solicitation/content", async () => {
    const c = await setup();
    expect((await c.get(`${c.base}/api/solicitations/abc/attachments`)).status).toBe(422);
    expect((await c.get(`${c.url}/invalid/content`)).status).toBe(422);
    expect((await c.get(`${c.base}/api/solicitations/99/attachments`)).status).toBe(404);
    expect((await c.get(`${c.url}/${randomUUID()}/content`)).status).toBe(404);
    expect((await c.get()).status).toBe(200);
  });
});
