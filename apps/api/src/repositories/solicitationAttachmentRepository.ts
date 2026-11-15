import type { DataSource } from "typeorm";
import { AttachmentUploadBatch } from "../entities/AttachmentUploadBatch.js";
import { Solicitation } from "../entities/Solicitation.js";
import { SolicitationAttachment } from "../entities/SolicitationAttachment.js";

export type AttachmentSolicitationState = Pick<Solicitation, "id" | "solicitanteId" | "responsavelId">;
export type BatchIdentity = Pick<AttachmentUploadBatch, "solicitacaoId" | "autorId" | "idempotencyKey">;
export type NewUploadBatch = BatchIdentity & Pick<AttachmentUploadBatch, "payloadHash">;
export type NewAttachment = Pick<SolicitationAttachment,
  "solicitacaoId" | "autorId" | "nomeOriginal" | "mimeType" | "tamanhoBytes" | "storageKey" | "uploadBatchId">;

export interface AttachmentTransaction {
  findSolicitationForUpdate(id: number): Promise<AttachmentSolicitationState | null>;
  findBatch(identity: BatchIdentity): Promise<AttachmentUploadBatch | null>;
  listBatch(batchId: string): Promise<SolicitationAttachment[]>;
  countConfirmed(solicitacaoId: number): Promise<number>;
  createBatch(batch: NewUploadBatch): Promise<AttachmentUploadBatch>;
  createAttachments(entries: NewAttachment[]): Promise<SolicitationAttachment[]>;
}

export interface SolicitationAttachmentRepository {
  findSolicitation(id: number): Promise<AttachmentSolicitationState | null>;
  listBySolicitation(id: number): Promise<SolicitationAttachment[]>;
  findAttachment(solicitacaoId: number, attachmentId: string): Promise<SolicitationAttachment | null>;
  transaction<T>(work: (transaction: AttachmentTransaction) => Promise<T>): Promise<T>;
}

/** Callback terminou, mas commit/release não foi confirmado ao chamador. */
export class AttachmentTransactionUncertainError extends Error {
  constructor(options?: ErrorOptions) {
    super("Não foi possível determinar o resultado da transação de anexos.", options);
    this.name = "AttachmentTransactionUncertainError";
  }
}

const order = { criadoEm: "ASC", id: "ASC" } as const;
const stateSelect = { id: true, solicitanteId: true, responsavelId: true } as const;

export function createSolicitationAttachmentRepository(dataSource: DataSource): SolicitationAttachmentRepository {
  return {
    findSolicitation(id) {
      return dataSource.getRepository(Solicitation).findOne({ where: { id }, select: stateSelect });
    },
    listBySolicitation(solicitacaoId) {
      return dataSource.getRepository(SolicitationAttachment).find({ where: { solicitacaoId }, order });
    },
    findAttachment(solicitacaoId, id) {
      return dataSource.getRepository(SolicitationAttachment).findOneBy({ id, solicitacaoId });
    },
    async transaction(work) {
      let callbackCompleted = false;
      try {
        // READ COMMITTED + lock na solicitação: a contagem posterior vê o lote
        // do upload anterior depois que este liberar o lock.
        return await dataSource.transaction("READ COMMITTED", async (manager) => {
          const attachments = manager.getRepository(SolicitationAttachment);
          const batches = manager.getRepository(AttachmentUploadBatch);
          const result = await work({
            findSolicitationForUpdate: (id) => manager.getRepository(Solicitation).findOne({
              where: { id }, select: stateSelect, lock: { mode: "pessimistic_write" },
            }),
            findBatch: (identity) => batches.findOneBy(identity),
            listBatch: (uploadBatchId) => attachments.find({ where: { uploadBatchId }, order }),
            countConfirmed: (solicitacaoId) => attachments.countBy({ solicitacaoId }),
            createBatch: (entry) => batches.save(batches.create(entry)),
            createAttachments: (entries) => attachments.save(attachments.create(entries)),
          });
          callbackCompleted = true;
          return result;
        });
      } catch (error) {
        if (callbackCompleted) throw new AttachmentTransactionUncertainError({ cause: error });
        throw error;
      }
    },
  };
}
