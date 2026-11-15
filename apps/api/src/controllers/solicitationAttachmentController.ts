import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AttachmentMultipartError, readAttachmentMultipart } from "../middleware/attachmentMultipart.js";
import {
  AttachmentAccessDeniedError, AttachmentCapacityError, AttachmentCompensationError,
  AttachmentIdempotencyConflictError, AttachmentNotFoundError, AttachmentSaveFailedError,
  AttachmentUploadUncertainError, InvalidAttachmentBatchError,
  type AttachmentMetadata, type SolicitationAttachmentService,
} from "../services/solicitationAttachmentService.js";
import { SolicitationNotFoundError } from "../services/statusHistoryService.js";
import { AttachmentStorageError, UnsafeAttachmentPathError } from "../storage/attachmentStorage.js";
import { InvalidAttachmentImageError } from "../validators/attachmentImageValidator.js";
import { idParamSchema } from "../validators/idParamSchema.js";

const keySchema = z.uuid({ error: "Informe uma chave UUID válida no cabeçalho Idempotency-Key." });
const contentParams = idParamSchema.extend({ attachmentId: z.uuid({ error: "Identificador de anexo inválido." }) });

function publicEntry(entry: AttachmentMetadata, id: number) {
  return {
    id: entry.id, nomeOriginal: entry.nomeOriginal, mimeType: entry.mimeType,
    tamanhoBytes: entry.tamanhoBytes, criadoEm: entry.criadoEm.toISOString(),
    contentUrl: `/api/solicitations/${id}/attachments/${encodeURIComponent(entry.id)}/content`,
  };
}

function validation(response: Response, error: z.ZodError, field?: string) {
  const fields = Object.fromEntries(error.issues.map((issue) => [field ?? String(issue.path[0] ?? "images"), issue.message]));
  response.status(422).json({ error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Dados de anexos inválidos.", fields } });
}

function handleError(error: unknown, response: Response, next: NextFunction, uploading: boolean) {
  let status: number;
  let code: string;
  let message: string;
  let fields: Record<string, string> | undefined;
  if (error instanceof AttachmentMultipartError) {
    ({ status, code, message } = error);
    fields = { images: message };
  } else if (error instanceof InvalidAttachmentImageError) {
    status = error.code === "ATTACHMENT_TOO_LARGE" ? 413 : 422;
    code = error.code === "ATTACHMENT_TOO_LARGE" ? error.code : "VALIDATION_ERROR";
    message = error.message;
    fields = { images: message };
  } else if (error instanceof InvalidAttachmentBatchError || error instanceof AttachmentCapacityError) {
    status = 422; code = "VALIDATION_ERROR"; message = error.message; fields = { images: message };
  } else if (error instanceof AttachmentAccessDeniedError) {
    status = 403; code = "FORBIDDEN"; message = error.message;
  } else if (error instanceof SolicitationNotFoundError || error instanceof AttachmentNotFoundError) {
    status = 404; code = error instanceof AttachmentNotFoundError ? "ATTACHMENT_NOT_FOUND" : "SOLICITATION_NOT_FOUND"; message = error.message;
  } else if (error instanceof AttachmentIdempotencyConflictError) {
    status = 409; code = "ATTACHMENT_IDEMPOTENCY_CONFLICT"; message = error.message;
  } else if (error instanceof AttachmentUploadUncertainError) {
    status = 503; code = "ATTACHMENT_UPLOAD_UNCERTAIN"; message = error.message;
  } else if (error instanceof AttachmentStorageError || error instanceof UnsafeAttachmentPathError || error instanceof AttachmentSaveFailedError || error instanceof AttachmentCompensationError) {
    status = 500;
    code = uploading ? "ATTACHMENT_SAVE_FAILED" : "ATTACHMENT_READ_FAILED";
    message = uploading ? "Não foi possível salvar as imagens. A solicitação permanece registrada." : "Não foi possível carregar a imagem.";
  } else {
    next(error);
    return;
  }
  response.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

export function createSolicitationAttachmentController(service: SolicitationAttachmentService) {
  return {
    async upload(request: Request, response: Response, next: NextFunction): Promise<void> {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) { validation(response, parsed.error); return; }
      const key = keySchema.safeParse(request.get("Idempotency-Key"));
      if (!key.success) { validation(response, key.error, "idempotencyKey"); return; }
      const user = request.authUser;
      if (!user) { next(new Error("Authenticated user missing on protected route.")); return; }
      try {
        const images = await readAttachmentMultipart(request);
        const entries = await service.upload(parsed.data.id, key.data, images, user);
        response.status(201).json({ data: entries.map((entry) => publicEntry(entry, parsed.data.id)) });
      } catch (error) { handleError(error, response, next, true); }
    },
    async list(request: Request, response: Response, next: NextFunction): Promise<void> {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) { validation(response, parsed.error); return; }
      const user = request.authUser;
      if (!user) { next(new Error("Authenticated user missing on protected route.")); return; }
      try {
        const entries = await service.list(parsed.data.id, user);
        response.status(200).json({ data: entries.map((entry) => publicEntry(entry, parsed.data.id)) });
      } catch (error) { handleError(error, response, next, false); }
    },
    async content(request: Request, response: Response, next: NextFunction): Promise<void> {
      const parsed = contentParams.safeParse(request.params);
      if (!parsed.success) { validation(response, parsed.error); return; }
      const user = request.authUser;
      if (!user) { next(new Error("Authenticated user missing on protected route.")); return; }
      try {
        const { metadata, bytes } = await service.read(parsed.data.id, parsed.data.attachmentId, user);
        response.setHeader("Content-Type", metadata.mimeType);
        response.setHeader("Content-Disposition", "inline");
        response.status(200).send(bytes);
      } catch (error) { handleError(error, response, next, false); }
    },
  };
}
