import type { DataSource, EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { Solicitation } from "../entities/Solicitation.js";
import { SolicitationAttachment } from "../entities/SolicitationAttachment.js";
import { AttachmentUploadBatch } from "../entities/AttachmentUploadBatch.js";
import {
  AttachmentTransactionUncertainError, createSolicitationAttachmentRepository,
} from "./solicitationAttachmentRepository.js";

function setup(failAfterCallback = false) {
  const orm = () => ({
    findOne: vi.fn(async (_options: unknown) => null),
    findOneBy: vi.fn(async (_options: unknown) => null),
    find: vi.fn(async (_options: unknown) => []),
    countBy: vi.fn(async (_options: unknown) => 0),
    create: vi.fn((entry: unknown) => entry),
    save: vi.fn(async (entry: unknown) => entry),
  });
  const solicitation = orm();
  const attachments = orm();
  const batches = orm();
  const manager = { getRepository: vi.fn((target: unknown) => {
    if (target === Solicitation) return solicitation;
    if (target === SolicitationAttachment) return attachments;
    if (target === AttachmentUploadBatch) return batches;
    throw new Error("Unexpected entity");
  }) };
  const failure = new Error("Commit acknowledgement lost");
  const transaction = vi.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) => {
    const result = await work(manager as unknown as EntityManager);
    if (failAfterCallback) throw failure;
    return result;
  });
  const globalGet = vi.fn((target: unknown) => manager.getRepository(target));
  const dataSource = { transaction, getRepository: globalGet } as unknown as DataSource;
  return { repository: createSolicitationAttachmentRepository(dataSource), transaction, solicitation, attachments, batches, globalGet, failure };
}

describe("attachment repository transaction contract (without PostgreSQL)", () => {
  it("uses READ COMMITTED and a pessimistic lock on the parent before counting", async () => {
    const c = setup();
    await c.repository.transaction(async (transaction) => {
      await transaction.findSolicitationForUpdate(7);
      await transaction.countConfirmed(7);
    });
    expect(c.transaction).toHaveBeenCalledWith("READ COMMITTED", expect.any(Function));
    expect(c.solicitation.findOne).toHaveBeenCalledWith({
      where: { id: 7 }, select: { id: true, solicitanteId: true, responsavelId: true },
      lock: { mode: "pessimistic_write" },
    });
    expect(c.attachments.countBy).toHaveBeenCalledWith({ solicitacaoId: 7 });
    expect(c.solicitation.save).not.toHaveBeenCalled();
    expect(c.globalGet).not.toHaveBeenCalled();
  });

  it("saves batch and attachments through the same transaction manager", async () => {
    const c = setup();
    const batch = { solicitacaoId: 7, autorId: "user", idempotencyKey: "key", payloadHash: "hash" };
    const entries = [{ solicitacaoId: 7, autorId: "user", nomeOriginal: "photo.png", mimeType: "image/png", tamanhoBytes: 10, storageKey: "internal", uploadBatchId: "batch" }];
    await c.repository.transaction(async (transaction) => {
      await transaction.findBatch(batch);
      await transaction.createBatch(batch);
      await transaction.createAttachments(entries);
      await transaction.listBatch("batch");
    });
    expect(c.batches.findOneBy).toHaveBeenCalledWith(batch);
    expect(c.batches.save).toHaveBeenCalledWith(batch);
    expect(c.attachments.save).toHaveBeenCalledWith(entries);
    expect(c.attachments.find).toHaveBeenCalledWith({ where: { uploadBatchId: "batch" }, order: { criadoEm: "ASC", id: "ASC" } });
    expect(c.solicitation.save).not.toHaveBeenCalled();
    expect(c.globalGet).not.toHaveBeenCalled();
  });

  it("always scopes content lookup to both attachment and solicitation IDs", async () => {
    const c = setup();
    await c.repository.findAttachment(7, "attachment");
    expect(c.attachments.findOneBy).toHaveBeenCalledWith({ id: "attachment", solicitacaoId: 7 });
    await c.repository.listBySolicitation(7);
    expect(c.attachments.find).toHaveBeenCalledWith({ where: { solicitacaoId: 7 }, order: { criadoEm: "ASC", id: "ASC" } });
  });

  it("propagates callback failure as a known non-commit", async () => {
    const c = setup();
    const failure = new Error("Metadata insert failed");
    await expect(c.repository.transaction(async () => { throw failure; })).rejects.toBe(failure);
  });

  it("marks a failure after callback completion as uncertain", async () => {
    const c = setup(true);
    await expect(c.repository.transaction(async () => "result"))
      .rejects.toMatchObject({ name: "AttachmentTransactionUncertainError", cause: c.failure });
    await expect(c.repository.transaction(async () => undefined))
      .rejects.toBeInstanceOf(AttachmentTransactionUncertainError);
  });
});
