import { createHash } from "node:crypto";
import { z } from "zod";
import { isAuthorized } from "../auth/authorization.js";
import type { SolicitationAttachment } from "../entities/SolicitationAttachment.js";
import {
  AttachmentTransactionUncertainError,
  type AttachmentSolicitationState, type BatchIdentity,
  type SolicitationAttachmentRepository,
} from "../repositories/solicitationAttachmentRepository.js";
import { AttachmentStorageError, type AttachmentStorage, type PreparedAttachment } from "../storage/attachmentStorage.js";
import { MAX_ATTACHMENT_BYTES, InvalidAttachmentImageError } from "../validators/attachmentImageValidator.js";
import type { PublicSessionUser } from "./sessionService.js";
import { SolicitationNotFoundError } from "./statusHistoryService.js";

type Viewer = Pick<PublicSessionUser, "id" | "role">;
export interface AttachmentUploadFile { nomeOriginal: string; bytes: Buffer }
export type AttachmentMetadata = Pick<SolicitationAttachment, "id" | "nomeOriginal" | "mimeType" | "tamanhoBytes" | "criadoEm">;

export class AttachmentAccessDeniedError extends Error {
  constructor() { super("Você não tem permissão para acessar estes anexos."); this.name = "AttachmentAccessDeniedError"; }
}
export class InvalidAttachmentBatchError extends Error {
  constructor(message = "Envie de 1 a 5 imagens com uma chave de idempotência UUID válida.") { super(message); this.name = "InvalidAttachmentBatchError"; }
}
export class AttachmentCapacityError extends Error {
  constructor() { super("A solicitação pode ter no máximo 5 imagens confirmadas."); this.name = "AttachmentCapacityError"; }
}
export class AttachmentIdempotencyConflictError extends Error {
  constructor() { super("A chave de idempotência já foi utilizada com outro conteúdo."); this.name = "AttachmentIdempotencyConflictError"; }
}
export class AttachmentNotFoundError extends Error {
  constructor() { super("Anexo não encontrado nesta solicitação."); this.name = "AttachmentNotFoundError"; }
}
export class AttachmentSaveFailedError extends Error {
  constructor(options?: ErrorOptions) {
    super("O lote de anexos não foi confirmado. A solicitação permanece registrada.", options);
    this.name = "AttachmentSaveFailedError";
  }
}
export class AttachmentUploadUncertainError extends Error {
  constructor(readonly identity: BatchIdentity, options?: ErrorOptions) {
    super("Não foi possível confirmar o resultado do envio. Preserve a mesma chave e consulte novamente antes de reenviar.", options);
    this.name = "AttachmentUploadUncertainError";
  }
}
export class AttachmentCompensationError extends Error {
  constructor(readonly failedKeys: string[], options?: ErrorOptions) {
    super("O envio falhou e alguns arquivos precisam de recuperação manual.", options);
    this.name = "AttachmentCompensationError";
  }
}

export interface SolicitationAttachmentService {
  upload(solicitacaoId: number, idempotencyKey: string, files: AttachmentUploadFile[], user: Viewer): Promise<AttachmentMetadata[]>;
  list(solicitacaoId: number, user: Viewer): Promise<AttachmentMetadata[]>;
  read(solicitacaoId: number, attachmentId: string, user: Viewer): Promise<{ metadata: AttachmentMetadata; bytes: Buffer }>;
}

export function createSolicitationAttachmentService(
  repository: SolicitationAttachmentRepository,
  storage: AttachmentStorage,
): SolicitationAttachmentService {
  async function readable(id: number, user: Viewer) {
    const state = await repository.findSolicitation(id);
    if (!state) throw new SolicitationNotFoundError();
    if (!isAuthorized(user, "request:read", { ownerId: state.solicitanteId, assignedMaintainerId: state.responsavelId })) {
      throw new AttachmentAccessDeniedError();
    }
  }

  async function compensate(keys: Set<string>, original: unknown) {
    const values = [...keys];
    const results = await Promise.allSettled(values.map((key) => storage.remove(key)));
    const failedKeys = values.filter((_key, index) => results[index].status === "rejected");
    if (failedKeys.length) {
      throw new AttachmentCompensationError(failedKeys, { cause: new AggregateError([
        original, ...results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason),
      ]) });
    }
  }

  return {
    async upload(solicitacaoId, idempotencyKey, files, user) {
      if (!user) throw new AttachmentAccessDeniedError();
      if (!Number.isSafeInteger(solicitacaoId) || solicitacaoId <= 0 || !z.uuid().safeParse(idempotencyKey).success || !Array.isArray(files) || files.length < 1 || files.length > 5) {
        throw new InvalidAttachmentBatchError();
      }
      // Autoriza antes de copiar/processar bytes. Revalida sob lock na transação.
      requireOwner(await repository.findSolicitation(solicitacaoId), user);
      for (const file of files) {
        if (!file || !Buffer.isBuffer(file.bytes) || typeof file.nomeOriginal !== "string" || !file.nomeOriginal.trim() || file.nomeOriginal.includes("\0")) throw new InvalidAttachmentBatchError("Cada imagem deve ter nome e conteúdo válidos.");
        if (file.bytes.length > MAX_ATTACHMENT_BYTES) throw new InvalidAttachmentImageError("ATTACHMENT_TOO_LARGE", "A imagem excede o limite de 5 MB.");
      }
      const input = files.map((file) => ({ nomeOriginal: file.nomeOriginal, bytes: Buffer.from(file.bytes) }));
      const payloadHash = createHash("sha256").update(JSON.stringify({
        version: 1,
        files: input.map((file) => ({ nomeOriginal: file.nomeOriginal, tamanhoBytes: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex") })),
      })).digest("hex");
      const identity = { solicitacaoId, autorId: user.id, idempotencyKey: idempotencyKey.toLowerCase() };
      const keys = new Set<string>();
      try {
        const result = await repository.transaction(async (transaction) => {
          requireOwner(await transaction.findSolicitationForUpdate(solicitacaoId), user);
          const previous = await transaction.findBatch(identity);
          if (previous) {
            if (previous.payloadHash !== payloadHash) throw new AttachmentIdempotencyConflictError();
            return transaction.listBatch(previous.id);
          }
          if (await transaction.countConfirmed(solicitacaoId) + input.length > 5) throw new AttachmentCapacityError();
          const prepared: PreparedAttachment[] = [];
          for (const file of input) {
            try {
              const item = await storage.prepare(file.bytes);
              keys.add(item.storageKey);
              prepared.push(item);
            } catch (error) {
              if (error instanceof AttachmentStorageError && error.storageKey) keys.add(error.storageKey);
              throw error;
            }
          }
          for (const item of prepared) await storage.confirm(item.storageKey);
          const batch = await transaction.createBatch({ ...identity, payloadHash });
          return transaction.createAttachments(prepared.map((item, index) => ({
            ...item, solicitacaoId, autorId: user.id,
            nomeOriginal: input[index].nomeOriginal, uploadBatchId: batch.id,
          })));
        });
        return toMetadata(result);
      } catch (error) {
        if (error instanceof AttachmentStorageError && error.storageKey) keys.add(error.storageKey);
        if (error instanceof AttachmentTransactionUncertainError) {
          let confirmed: SolicitationAttachment[] | null;
          try {
            // Novo lock aguarda o término da transação original antes da consulta.
            confirmed = await repository.transaction(async (transaction) => {
              const state = await transaction.findSolicitationForUpdate(solicitacaoId);
              if (!state) throw new SolicitationNotFoundError();
              const batch = await transaction.findBatch(identity);
              if (!batch) return null;
              if (batch.payloadHash !== payloadHash) throw new AttachmentIdempotencyConflictError();
              return transaction.listBatch(batch.id);
            });
          } catch (reconciliationError) {
            throw new AttachmentUploadUncertainError(identity, { cause: new AggregateError([error, reconciliationError]) });
          }
          if (confirmed) {
            // Uma tentativa concorrente pode ter confirmado o mesmo lote.
            const referenced = new Set(confirmed.map((entry) => entry.storageKey));
            await compensate(new Set([...keys].filter((key) => !referenced.has(key))), error);
            return toMetadata(confirmed);
          }
          await compensate(keys, error);
          throw new AttachmentSaveFailedError({ cause: error });
        }
        await compensate(keys, error);
        throw error;
      }
    },
    async list(solicitacaoId, user) {
      await readable(solicitacaoId, user);
      return toMetadata(await repository.listBySolicitation(solicitacaoId));
    },
    async read(solicitacaoId, attachmentId, user) {
      await readable(solicitacaoId, user);
      const attachment = await repository.findAttachment(solicitacaoId, attachmentId);
      if (!attachment) throw new AttachmentNotFoundError();
      return { metadata: publicMetadata(attachment), bytes: await storage.read(attachment.storageKey) };
    },
  };
}

function requireOwner(state: AttachmentSolicitationState | null, user: Viewer) {
  if (!state) throw new SolicitationNotFoundError();
  if (state.solicitanteId !== user.id) throw new AttachmentAccessDeniedError();
}
function publicMetadata({ id, nomeOriginal, mimeType, tamanhoBytes, criadoEm }: SolicitationAttachment): AttachmentMetadata {
  return { id, nomeOriginal, mimeType, tamanhoBytes, criadoEm };
}
function toMetadata(entries: SolicitationAttachment[]) {
  return [...entries].sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime() || a.id.localeCompare(b.id)).map(publicMetadata);
}
