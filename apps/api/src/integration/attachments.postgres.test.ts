import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import bcrypt from "bcrypt";
import sharp from "sharp";
import type { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createDataSource } from "../config/database.js";
import { AttachmentUploadBatch } from "../entities/AttachmentUploadBatch.js";
import { AuthSession } from "../entities/AuthSession.js";
import { Solicitation } from "../entities/Solicitation.js";
import { SolicitationAttachment } from "../entities/SolicitationAttachment.js";
import { StatusHistory, TipoRegistro } from "../entities/StatusHistory.js";
import { User, UserRole, UserSpecialty } from "../entities/User.js";
import { createAssetRepository } from "../repositories/assetRepository.js";
import { createSolicitationAttachmentRepository, type SolicitationAttachmentRepository } from "../repositories/solicitationAttachmentRepository.js";
import { createSolicitationRepository } from "../repositories/solicitationRepository.js";
import { createStatusHistoryRepository } from "../repositories/statusHistoryRepository.js";
import { createUserManagementRepository } from "../repositories/userManagementRepository.js";
import type { SessionRepository } from "../services/sessionService.js";
import { AttachmentStorageError, type AttachmentStorage } from "../storage/attachmentStorage.js";
import { createLocalAttachmentStorage } from "../storage/localAttachmentStorage.js";

// Nunca usa DATABASE_URL/.env de desenvolvimento. Habilitado só no Compose isolado.
const integration = process.env.FIXIT_ATTACHMENT_INTEGRATION === "1" ? describe : describe.skip;
const phase = process.env.FIXIT_ATTACHMENT_PHASE ?? "write";
const origin = "http://localhost:5173";
const uploadDir = "/app/uploads";
const evidenceFile = join(uploadDir, "integration-evidence.json");
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
interface Evidence {
  project: string;
  cookie: string;
  images: { solicitacaoId: number; attachmentId: string; storageKey: string; mimeType: string; hash: string }[];
}

integration("US009 — isolated PostgreSQL, HTTP and persistent volume", () => {
  let source: DataSource;
  let server: Server | undefined;
  let base: string;
  let owner: User;
  let maintainer: User;
  let ownerCookie: string;
  let otherCookie: string;
  let managerCookie: string;
  let maintainerCookie: string;
  let evidence: Evidence;
  let failMetadata = false;
  let failConfirmationAt = 0;
  let confirmations = 0;
  let gate: { entered(): void; release: Promise<void> } | undefined;

  beforeAll(async () => {
    const project = process.env.FIXIT_ATTACHMENT_TEST_PROJECT ?? "";
    if (!/^fixit-us009-it-[a-f0-9]{12}$/.test(project)) throw new Error("Refusing non-isolated test project");
    const url = new URL(process.env.ATTACHMENT_TEST_DATABASE_URL ?? "invalid:");
    if (url.hostname !== "db" || url.pathname !== "/fixit_us009_integration" || url.username !== "fixit_it" || process.env.UPLOAD_DIR !== uploadDir || !["read", "write"].includes(phase)) {
      throw new Error("Refusing database/storage outside the dedicated integration Compose");
    }
    source = createDataSource(url.toString());
    await source.initialize();
    expect((await source.query("SELECT current_database() AS name"))[0].name).toBe("fixit_us009_integration");
    if (phase === "write") {
      const [{ count }] = await source.query("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'");
      if (Number(count) !== 0) throw new Error("Write phase requires a new empty test database; refusing existing data");
      await source.runMigrations();
    } else {
      evidence = JSON.parse(await fs.readFile(evidenceFile, "utf8")) as Evidence;
      expect(evidence.project).toBe(project);
      ownerCookie = evidence.cookie;
    }

    const users = source.getRepository(User);
    const sessions = source.getRepository(AuthSession);
    const sessionRepository: SessionRepository = {
      create: (entry) => sessions.create(entry), save: (entry) => sessions.save(entry),
      findOneByTokenHash: (tokenHash) => sessions.findOneBy({ tokenHash }),
      findUserById: (id) => users.findOneBy({ id }),
    };
    const realRepository = createSolicitationAttachmentRepository(source);
    const repository: SolicitationAttachmentRepository = {
      ...realRepository,
      transaction(work) {
        return realRepository.transaction((transaction) => work({
          ...transaction,
          async createAttachments(entries) {
            const saved = await transaction.createAttachments(entries);
            // Insere no PostgreSQL ANTES da falha para comprovar rollback real.
            if (failMetadata) throw new Error("Injected failure after metadata insert");
            return saved;
          },
        }));
      },
    };
    const local = createLocalAttachmentStorage(uploadDir);
    const storage: AttachmentStorage = {
      ...local,
      async prepare(bytes) {
        if (gate) {
          const current = gate;
          gate = undefined;
          current.entered();
          await current.release;
        }
        return local.prepare(bytes);
      },
      async confirm(key) {
        if (failConfirmationAt && ++confirmations === failConfirmationAt) throw new AttachmentStorageError("confirm", key);
        return local.confirm(key);
      },
    };
    server = createApp(
      async () => { await source.query("SELECT 1"); },
      { create: (entry) => users.create(entry), findOneBy: (where) => users.findOneBy(where), save: (entry) => users.save(entry) },
      sessionRepository, createUserManagementRepository(source), { secureCookies: false, webOrigin: origin },
      createAssetRepository(source), createStatusHistoryRepository(source), createSolicitationRepository(source),
      { repository, storage },
    ).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test API port");
    base = `http://127.0.0.1:${address.port}`;

    if (phase === "write") {
      const password = "integration-only-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const seed = async (role: UserRole, name: string) => users.save(users.create({
        fullName: name, email: `${randomUUID()}@integration.example`, passwordHash,
        institutionId: "UEM", role, specialty: role === UserRole.MANUTENTOR ? UserSpecialty.INFORMATICA : null,
        isActive: true, cpf: null, cityUf: null,
      }));
      owner = await seed(UserRole.CLIENTE, "Integration owner");
      const other = await seed(UserRole.CLIENTE, "Integration other");
      const manager = await seed(UserRole.GESTOR, "Integration manager");
      maintainer = await seed(UserRole.MANUTENTOR, "Integration maintainer");
      const login = async (user: User) => {
        const response = await fetch(`${base}/api/sessions`, {
          method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ email: user.email, password }),
        });
        expect(response.status).toBe(201);
        const cookie = response.headers.get("set-cookie")?.split(";")[0];
        if (!cookie) throw new Error("Missing real session cookie");
        return cookie;
      };
      ownerCookie = await login(owner);
      otherCookie = await login(other);
      managerCookie = await login(manager);
      maintainerCookie = await login(maintainer);
      evidence = { project, cookie: ownerCookie, images: [] };
    }
  }, 60_000);

  afterEach(() => {
    failMetadata = false;
    failConfirmationAt = 0;
    confirmations = 0;
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    try {
      if (phase === "write" && evidence?.images.length === 3) {
        await fs.writeFile(evidenceFile, JSON.stringify(evidence), { flag: "wx", mode: 0o600 });
      }
    } finally {
      if (server?.listening) await new Promise<void>((done, reject) => server!.close((error) => error ? reject(error) : done()));
      if (source?.isInitialized) await source.destroy();
    }
  });

  async function createSolicitation() {
    const response = await fetch(`${base}/api/solicitations`, {
      method: "POST", headers: { Cookie: ownerCookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ local: "Integration room", tipoProblema: "INFORMATICA", descricaoProblema: "Integration evidence", urgencia: "ALTA" }),
    });
    expect(response.status).toBe(201);
    return (await response.json()).data.solicitation.id as number;
  }
  async function image(format: "jpeg" | "png" | "webp" = "png") {
    return sharp({ create: { width: 12, height: 12, channels: 3, background: "red" } }).toFormat(format).toBuffer();
  }
  async function upload(id: number, bytes: Buffer[], key = randomUUID(), cookie = ownerCookie) {
    const body = new FormData();
    bytes.forEach((entry, index) => body.append("images", new Blob([new Uint8Array(entry)], { type: "application/octet-stream" }), `photo-${index}.bin`));
    return fetch(`${base}/api/solicitations/${id}/attachments`, {
      method: "POST", headers: { Cookie: cookie, Origin: origin, "Idempotency-Key": key }, body,
    });
  }
  const get = (path: string, cookie = ownerCookie) => fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  async function fileSnapshot() {
    const list = async (directory: string) => fs.readdir(join(uploadDir, directory)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [] as string[];
      throw error;
    });
    return { temporary: (await list("temporary")).sort(), permanent: (await list("permanent")).sort() };
  }
  async function expectPreserved(id: number) {
    expect(await source.getRepository(Solicitation).findOneByOrFail({ id })).toMatchObject({ solicitanteId: owner.id, status: "EM_ABERTO" });
    const opening = await source.getRepository(StatusHistory).find({ where: { solicitacaoId: id } });
    expect(opening).toHaveLength(1);
    expect(opening[0]).toMatchObject({ tipo: TipoRegistro.ABERTURA, autorId: owner.id, statusNovo: "EM_ABERTO" });
    expect(await source.getRepository(SolicitationAttachment).countBy({ solicitacaoId: id })).toBe(0);
    expect(await source.getRepository(AttachmentUploadBatch).countBy({ solicitacaoId: id })).toBe(0);
  }

  if (phase === "write") {
    it.each(["jpeg", "png", "webp"] as const)("persists %s metadata and original bytes through real HTTP", async (format) => {
      const id = await createSolicitation();
      const bytes = await image(format);
      const response = await upload(id, [bytes]);
      expect(response.status).toBe(201);
      const [entry] = (await response.json()).data;
      expect(entry.mimeType).toBe(`image/${format}`);
      expect(entry).not.toHaveProperty("storageKey");
      const stored = await source.getRepository(SolicitationAttachment).findOneByOrFail({ id: entry.id, solicitacaoId: id });
      expect(stored).toMatchObject({ autorId: owner.id, tamanhoBytes: bytes.length, mimeType: `image/${format}` });
      expect(stored.uploadBatchId).not.toBeNull();
      expect(await fs.readFile(join(uploadDir, "permanent", stored.storageKey))).toEqual(bytes);
      const list = await get(`/api/solicitations/${id}/attachments`);
      expect(list.status).toBe(200);
      expect((await list.json()).data).toEqual([entry]);
      const content = await get(entry.contentUrl);
      expect(content.status).toBe(200);
      expect(Buffer.from(await content.arrayBuffer())).toEqual(bytes);
      evidence.images.push({ solicitacaoId: id, attachmentId: stored.id, storageKey: stored.storageKey, mimeType: stored.mimeType, hash: sha256(bytes) });
    });

    it("authorizes upload ownership and protects both metadata and content", async () => {
      const id = await createSolicitation();
      const bytes = await image();
      expect((await upload(id, [bytes], randomUUID(), otherCookie)).status).toBe(403);
      expect((await upload(id, [bytes], randomUUID(), managerCookie)).status).toBe(403);
      const [entry] = (await (await upload(id, [bytes])).json()).data;
      expect((await get(`/api/solicitations/${id}/attachments`, otherCookie)).status).toBe(403);
      expect((await get(entry.contentUrl, otherCookie)).status).toBe(403);
      expect((await get(entry.contentUrl, maintainerCookie)).status).toBe(403);
      expect((await get(entry.contentUrl, managerCookie)).status).toBe(200);
      expect((await fetch(`${base}${entry.contentUrl}`)).status).toBe(401);
      const assigned = await fetch(`${base}/api/solicitations/${id}/assignee`, {
        method: "PATCH", headers: { Cookie: managerCookie, Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ maintainerId: maintainer.id }),
      });
      expect(assigned.status).toBe(200);
      expect((await get(entry.contentUrl, maintainerCookie)).status).toBe(200);
      const otherRequest = await createSolicitation();
      expect((await get(`/api/solicitations/${otherRequest}/attachments/${entry.id}/content`, managerCookie)).status).toBe(404);
    });

    it("replays a full-capacity batch and rejects conflicting reuse without duplication", async () => {
      const id = await createSolicitation();
      const bytes = await image();
      const key = randomUUID();
      const first = await upload(id, Array(5).fill(bytes), key);
      expect(first.status).toBe(201);
      const expected = await first.json();
      const snapshot = await fileSnapshot();
      const replay = await upload(id, Array(5).fill(bytes), key);
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(expected);
      expect(await fileSnapshot()).toEqual(snapshot);
      expect((await upload(id, [await image("jpeg")], key)).status).toBe(409);
      expect((await upload(id, [bytes])).status).toBe(422);
      expect(await source.getRepository(SolicitationAttachment).countBy({ solicitacaoId: id })).toBe(5);
      expect(await source.getRepository(AttachmentUploadBatch).countBy({ solicitacaoId: id })).toBe(1);
    });

    it("serializes competing uploads with a real PostgreSQL row lock", async () => {
      const id = await createSolicitation();
      const bytes = await image();
      let entered!: () => void;
      let release!: () => void;
      const enteredPromise = new Promise<void>((done) => { entered = done; });
      const releasePromise = new Promise<void>((done) => { release = done; });
      gate = { entered, release: releasePromise };
      const first = upload(id, Array(3).fill(bytes));
      let second: Promise<Response> | undefined;
      try {
        await enteredPromise;
        second = upload(id, Array(3).fill(bytes));
        let observedLock = false;
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          const [{ waiting }] = await source.query(`SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%solicitations%'`);
          if (Number(waiting) > 0) { observedLock = true; break; }
          await new Promise((done) => setTimeout(done, 25));
        }
        expect(observedLock).toBe(true);
      } finally { release(); gate = undefined; }
      expect((await first).status).toBe(201);
      expect((await second!).status).toBe(422);
      expect(await source.getRepository(SolicitationAttachment).countBy({ solicitacaoId: id })).toBe(3);
      expect(await source.getRepository(AttachmentUploadBatch).countBy({ solicitacaoId: id })).toBe(1);
    }, 20_000);

    it.each(["corrupt", "storage", "metadata"])("rolls back and compensates %s failure, preserving US007", async (fault) => {
      const id = await createSolicitation();
      const before = await fileSnapshot();
      const bytes = await image();
      if (fault === "metadata") {
        failMetadata = true;
        vi.spyOn(console, "error").mockImplementation(() => undefined);
      }
      if (fault === "storage") { failConfirmationAt = 2; confirmations = 0; }
      const response = await upload(id, [bytes, fault === "corrupt" ? bytes.subarray(0, 35) : bytes]);
      expect(response.status).toBe(fault === "corrupt" ? 422 : 500);
      expect(await fileSnapshot()).toEqual(before);
      await expectPreserved(id);
    });
  } else {
    it("reads the same PostgreSQL metadata, session and volume bytes after container recreation", async () => {
      expect(evidence.images.map((entry) => entry.mimeType).sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
      for (const expected of evidence.images) {
        const row = await source.getRepository(SolicitationAttachment).findOneByOrFail({ id: expected.attachmentId, solicitacaoId: expected.solicitacaoId });
        expect(row.storageKey).toBe(expected.storageKey);
        expect(sha256(await fs.readFile(join(uploadDir, "permanent", row.storageKey)))).toBe(expected.hash);
        const response = await get(`/api/solicitations/${expected.solicitacaoId}/attachments/${row.id}/content`);
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe(expected.mimeType);
        expect(sha256(Buffer.from(await response.arrayBuffer()))).toBe(expected.hash);
      }
    });
  }
});
