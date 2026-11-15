import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AttachmentUploadBatch } from "../entities/AttachmentUploadBatch.js";
import { SolicitationAttachment } from "../entities/SolicitationAttachment.js";
import { UserRole } from "../entities/User.js";
import {
  AttachmentTransactionUncertainError,
  type SolicitationAttachmentRepository, type AttachmentTransaction,
} from "../repositories/solicitationAttachmentRepository.js";
import { AttachmentStorageError, type AttachmentStorage } from "../storage/attachmentStorage.js";
import {
  createSolicitationAttachmentService, AttachmentAccessDeniedError,
  AttachmentCapacityError, AttachmentCompensationError, AttachmentIdempotencyConflictError,
  AttachmentNotFoundError, AttachmentSaveFailedError, InvalidAttachmentBatchError,
} from "./solicitationAttachmentService.js";
import { SolicitationNotFoundError } from "./statusHistoryService.js";

const owner = { id: "owner", role: UserRole.CLIENTE };
const manager = { id: "manager", role: UserRole.GESTOR };
const files = (count = 1) => Array.from({ length: count }, (_, i) => ({ nomeOriginal: `photo-${i}.png`, bytes: Buffer.from(`image-${i}`) }));

function setup() {
  const state = { id: 1, solicitanteId: owner.id, responsavelId: "maintainer" };
  // Fakes comprovam coordenação e serialização simulada, não locks PostgreSQL.
  let attachments: SolicitationAttachment[] = [];
  let batches: AttachmentUploadBatch[] = [];
  let tail = Promise.resolve();
  const faults: ("beforeCommit" | "afterCommit" | "offline")[] = [];
  const beforeSave = vi.fn(async () => undefined);
  const count = vi.fn();
  const lock = vi.fn();
  const repository: SolicitationAttachmentRepository = {
    findSolicitation: vi.fn(async (id) => id === 1 ? state : null),
    listBySolicitation: vi.fn(async (id) => attachments.filter((entry) => entry.solicitacaoId === id)),
    findAttachment: vi.fn(async (id, attachmentId) => attachments.find((entry) => entry.solicitacaoId === id && entry.id === attachmentId) ?? null),
    async transaction(work) {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const fault = faults.shift();
      try {
        if (fault === "offline") throw new Error("Database unavailable");
        const nextAttachments = [...attachments];
        const nextBatches = [...batches];
        const tx: AttachmentTransaction = {
          findSolicitationForUpdate: async (id) => { lock(id); return id === 1 ? state : null; },
          findBatch: async (identity) => nextBatches.find((batch) => batch.solicitacaoId === identity.solicitacaoId && batch.autorId === identity.autorId && batch.idempotencyKey === identity.idempotencyKey) ?? null,
          listBatch: async (id) => nextAttachments.filter((entry) => entry.uploadBatchId === id),
          countConfirmed: async (id) => { count(); return nextAttachments.filter((entry) => entry.solicitacaoId === id).length; },
          createBatch: async (entry) => {
            const batch = Object.assign(new AttachmentUploadBatch(), entry, { id: randomUUID(), criadoEm: new Date() });
            nextBatches.push(batch);
            return batch;
          },
          createAttachments: async (entries) => {
            await beforeSave();
            const saved = entries.map((entry) => Object.assign(new SolicitationAttachment(), entry, { id: randomUUID(), criadoEm: new Date("2026-11-14T12:00:00Z") }));
            nextAttachments.push(...saved);
            return saved;
          },
        };
        const result = await work(tx);
        if (fault === "beforeCommit") throw new AttachmentTransactionUncertainError();
        attachments = nextAttachments;
        batches = nextBatches;
        if (fault === "afterCommit") throw new AttachmentTransactionUncertainError();
        return result;
      } finally { release(); }
    },
  };
  const temporary = new Set<string>();
  const permanent = new Set<string>();
  const storage = {
    prepare: vi.fn<AttachmentStorage["prepare"]>(async (bytes) => {
      const storageKey = randomUUID();
      temporary.add(storageKey);
      return { storageKey, mimeType: "image/png", tamanhoBytes: bytes.length };
    }),
    confirm: vi.fn<AttachmentStorage["confirm"]>(async (key) => { temporary.delete(key); permanent.add(key); }),
    remove: vi.fn<AttachmentStorage["remove"]>(async (key) => { temporary.delete(key); permanent.delete(key); }),
    read: vi.fn<AttachmentStorage["read"]>(async () => Buffer.from("image")),
  };
  return {
    service: createSolicitationAttachmentService(repository, storage), repository, storage,
    state, faults, beforeSave, count, lock, temporary, permanent,
    attachments: () => attachments, batches: () => batches,
  };
}

describe("attachment upload service — simulated transactions and storage", () => {
  it.each(Object.values(UserRole))("lets the requester upload as %s and returns only public metadata", async (role) => {
    const c = setup();
    const result = await c.service.upload(1, randomUUID(), files(2), { ...owner, role });
    expect(result).toHaveLength(2);
    expect(result[0]).not.toHaveProperty("storageKey");
    expect(c.attachments()).toHaveLength(2);
    expect(c.attachments()[0]).toMatchObject({ solicitacaoId: 1, autorId: owner.id, uploadBatchId: c.batches()[0].id });
    expect(c.permanent.size).toBe(2);
    expect(c.temporary.size).toBe(0);
    expect(c.lock).toHaveBeenCalledWith(1);
  });

  it("replays a confirmed full-capacity batch before checking capacity", async () => {
    const c = setup();
    const key = randomUUID();
    const first = await c.service.upload(1, key, files(5), owner);
    c.count.mockClear();
    const replay = await c.service.upload(1, key.toUpperCase(), files(5), owner);
    expect(replay).toEqual(first);
    expect(c.count).not.toHaveBeenCalled();
    expect(c.storage.prepare).toHaveBeenCalledTimes(5);
    expect(c.batches()).toHaveLength(1);
  });

  it.each(["bytes", "name", "order"])("rejects key reuse with different %s before capacity", async (change) => {
    const c = setup();
    const key = randomUUID();
    await c.service.upload(1, key, files(5), owner);
    const changed = files(5);
    if (change === "bytes") changed[0].bytes = Buffer.from("different");
    if (change === "name") changed[0].nomeOriginal = "different.png";
    if (change === "order") changed.reverse();
    c.count.mockClear();
    await expect(c.service.upload(1, key, changed, owner)).rejects.toBeInstanceOf(AttachmentIdempotencyConflictError);
    expect(c.count).not.toHaveBeenCalled();
    expect(c.permanent.size).toBe(5);
  });

  it.each([0, 6])("rejects %s files before storage", async (quantity) => {
    const c = setup();
    await expect(c.service.upload(1, randomUUID(), files(quantity), owner)).rejects.toBeInstanceOf(InvalidAttachmentBatchError);
    expect(c.storage.prepare).not.toHaveBeenCalled();
  });
  it("rejects malformed keys and oversized files", async () => {
    const c = setup();
    await expect(c.service.upload(1, "bad", files(), owner)).rejects.toBeInstanceOf(InvalidAttachmentBatchError);
    await expect(c.service.upload(1, randomUUID(), [{ nomeOriginal: "large.png", bytes: Buffer.alloc(5_000_001) }], owner)).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE" });
    expect(c.storage.prepare).not.toHaveBeenCalled();
  });

  it("allows independent batches up to five and rejects a sixth without touching earlier files", async () => {
    const c = setup();
    await c.service.upload(1, randomUUID(), files(3), owner);
    await c.service.upload(1, randomUUID(), files(2), owner);
    await expect(c.service.upload(1, randomUUID(), files(), owner)).rejects.toBeInstanceOf(AttachmentCapacityError);
    expect(c.permanent.size).toBe(5);
    expect(c.storage.remove).not.toHaveBeenCalled();
  });

  it.each(Object.values(UserRole))("denies another requester even as %s", async (role) => {
    const c = setup();
    await expect(c.service.upload(1, randomUUID(), files(), { id: "other", role })).rejects.toBeInstanceOf(AttachmentAccessDeniedError);
    expect(c.storage.prepare).not.toHaveBeenCalled();
  });
  it("rejects a missing solicitation", async () => {
    const c = setup();
    await expect(c.service.upload(2, randomUUID(), files(), owner)).rejects.toBeInstanceOf(SolicitationNotFoundError);
  });
  it("rechecks ownership under the lock", async () => {
    const c = setup();
    vi.spyOn(c.repository, "findSolicitation").mockImplementationOnce(async () => {
      const snapshot = { ...c.state };
      c.state.solicitanteId = "other";
      return snapshot;
    });
    await expect(c.service.upload(1, randomUUID(), files(), owner)).rejects.toBeInstanceOf(AttachmentAccessDeniedError);
    expect(c.storage.prepare).not.toHaveBeenCalled();
  });

  it("simulates concurrent different batches without exceeding capacity", async () => {
    const c = setup();
    const results = await Promise.allSettled([
      c.service.upload(1, randomUUID(), files(3), owner),
      c.service.upload(1, randomUUID(), files(3), owner),
    ]);
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(results.find((entry) => entry.status === "rejected")).toMatchObject({ reason: expect.any(AttachmentCapacityError) });
    expect(c.attachments()).toHaveLength(3);
    expect(c.permanent.size).toBe(3);
  });
  it("simulates concurrent retries of the same batch without duplicating", async () => {
    const c = setup();
    const key = randomUUID();
    const results = await Promise.all([c.service.upload(1, key, files(3), owner), c.service.upload(1, key, files(3), owner)]);
    expect(results[1]).toEqual(results[0]);
    expect(c.storage.prepare).toHaveBeenCalledTimes(3);
  });

  it.each(["prepare", "confirm", "metadata"])("compensates the entire new batch after %s failure", async (stage) => {
    const c = setup();
    await c.service.upload(1, randomUUID(), files(), owner);
    const original = [...c.permanent];
    const failure = new Error("Failure");
    if (stage === "prepare") {
      const prepare = c.storage.prepare.getMockImplementation()!;
      c.storage.prepare.mockImplementationOnce(prepare).mockRejectedValueOnce(failure);
    }
    if (stage === "confirm") c.storage.confirm.mockImplementationOnce(async (key) => { c.permanent.add(key); throw failure; });
    if (stage === "metadata") c.beforeSave.mockRejectedValueOnce(failure);
    await expect(c.service.upload(1, randomUUID(), files(2), owner)).rejects.toBe(failure);
    expect([...c.permanent]).toEqual(original);
    expect(c.temporary.size).toBe(0);
    expect(c.attachments()).toHaveLength(1);
    expect(c.batches()).toHaveLength(1);
    expect(c.state).toEqual({ id: 1, solicitanteId: owner.id, responsavelId: "maintainer" });
  });
  it("also compensates the key of a failed prepare that could not clean itself", async () => {
    const c = setup();
    const key = randomUUID();
    c.storage.prepare.mockImplementationOnce(async () => {
      c.temporary.add(key);
      throw new AttachmentStorageError("prepare", key);
    });
    await expect(c.service.upload(1, randomUUID(), files(), owner)).rejects.toBeInstanceOf(AttachmentStorageError);
    expect(c.storage.remove).toHaveBeenCalledWith(key);
    expect(c.temporary.size).toBe(0);
  });
  it("attempts every compensation and reports keys whose deletion failed", async () => {
    const c = setup();
    c.beforeSave.mockRejectedValueOnce(new Error("Insert failed"));
    c.storage.remove.mockRejectedValueOnce(new Error("Disk unavailable"));
    await expect(c.service.upload(1, randomUUID(), files(2), owner)).rejects.toBeInstanceOf(AttachmentCompensationError);
    expect(c.storage.remove).toHaveBeenCalledTimes(2);
    expect(c.attachments()).toHaveLength(0);
  });
  it("reconciles a lost commit response and preserves confirmed files", async () => {
    const c = setup();
    c.faults.push("afterCommit");
    const result = await c.service.upload(1, randomUUID(), files(2), owner);
    expect(result).toHaveLength(2);
    expect(c.storage.remove).not.toHaveBeenCalled();
    expect(c.lock).toHaveBeenCalledTimes(2);
    expect(c.permanent.size).toBe(2);
  });
  it("compensates after reconciliation establishes no batch was committed", async () => {
    const c = setup();
    c.faults.push("beforeCommit");
    await expect(c.service.upload(1, randomUUID(), files(2), owner)).rejects.toBeInstanceOf(AttachmentSaveFailedError);
    expect(c.storage.remove).toHaveBeenCalledTimes(2);
    expect(c.permanent.size).toBe(0);
    expect(c.batches()).toHaveLength(0);
  });
  it("preserves files and reports uncertainty if reconciliation cannot complete", async () => {
    const c = setup();
    c.faults.push("afterCommit", "offline");
    const key = randomUUID();
    await expect(c.service.upload(1, key, files(), owner)).rejects.toMatchObject({
      name: "AttachmentUploadUncertainError", identity: { solicitacaoId: 1, autorId: owner.id, idempotencyKey: key },
    });
    expect(c.storage.remove).not.toHaveBeenCalled();
    expect(c.permanent.size).toBe(1);
    expect(await c.service.upload(1, key, files(), owner)).toHaveLength(1);
    expect(c.storage.prepare).toHaveBeenCalledOnce();
  });

  it.each([
    owner, manager, { id: "maintainer", role: UserRole.MANUTENTOR },
  ])("allows list and content according to read permissions: $role", async (viewer) => {
    const c = setup();
    const [created] = await c.service.upload(1, randomUUID(), files(), owner);
    expect(await c.service.list(1, viewer)).toEqual([created]);
    expect(await c.service.read(1, created.id, viewer)).toEqual({ metadata: created, bytes: Buffer.from("image") });
  });
  it.each([
    { id: "other", role: UserRole.CLIENTE }, { id: "other", role: UserRole.MANUTENTOR },
  ])("denies out-of-scope reads for $role", async (viewer) => {
    const c = setup();
    await expect(c.service.list(1, viewer)).rejects.toBeInstanceOf(AttachmentAccessDeniedError);
    await expect(c.service.read(1, randomUUID(), viewer)).rejects.toBeInstanceOf(AttachmentAccessDeniedError);
    expect(c.storage.read).not.toHaveBeenCalled();
  });
  it("does not read a file whose attachment does not belong to the solicitation", async () => {
    const c = setup();
    await expect(c.service.read(1, randomUUID(), owner)).rejects.toBeInstanceOf(AttachmentNotFoundError);
    expect(c.repository.findAttachment).toHaveBeenCalledWith(1, expect.any(String));
    expect(c.storage.read).not.toHaveBeenCalled();
  });
  it("allows a missing attachment list to be empty and rejects missing solicitation reads", async () => {
    const c = setup();
    expect(await c.service.list(1, owner)).toEqual([]);
    await expect(c.service.list(2, owner)).rejects.toBeInstanceOf(SolicitationNotFoundError);
  });
});
