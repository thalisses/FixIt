import { Transform } from "node:stream";
import busboy from "busboy";
import type { Request } from "express";
import type { AttachmentUploadFile } from "../services/solicitationAttachmentService.js";
import { MAX_ATTACHMENT_BYTES } from "../validators/attachmentImageValidator.js";

export const MAX_ATTACHMENT_REQUEST_BYTES = 26_000_000;

export class AttachmentMultipartError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "AttachmentMultipartError";
  }
}

function drainRejectedRequest(request: Request) {
  // Um cliente pode desconectar enquanto descartamos o restante do corpo.
  // Mantenha o listener até close para não deixar ECONNRESET sem tratamento.
  const ignoreReset = () => undefined;
  request.on("error", ignoreReset);
  request.once("close", () => request.off("error", ignoreReset));
  request.resume();
}

/** Memória limitada por requisição; não grava arquivos antes da autorização do serviço. */
export function readAttachmentMultipart(request: Request): Promise<AttachmentUploadFile[]> {
  if (!request.is("multipart/form-data")) {
    drainRejectedRequest(request);
    return Promise.reject(new AttachmentMultipartError(415, "UNSUPPORTED_MEDIA_TYPE", "Envie as imagens como multipart/form-data."));
  }
  const contentLength = Number(request.get("Content-Length"));
  if (contentLength > MAX_ATTACHMENT_REQUEST_BYTES) {
    drainRejectedRequest(request);
    return Promise.reject(new AttachmentMultipartError(413, "ATTACHMENT_TOO_LARGE", "O envio completo excede o limite de 26 MB."));
  }

  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: request.headers,
        defParamCharset: "utf8",
        limits: {
          // Busboy sinaliza ao atingir o limite; +1 permite exatamente 5 MB.
          fileSize: MAX_ATTACHMENT_BYTES + 1,
          files: 5, fields: 0, parts: 6, fieldNameSize: 100, fieldSize: 0, headerPairs: 50,
        },
      });
    } catch {
      drainRejectedRequest(request);
      reject(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Multipart inválido: informe um delimitador válido."));
      return;
    }

    const files: { nomeOriginal: string; chunks: Buffer[]; size: number }[] = [];
    let failure: AttachmentMultipartError | undefined;
    let settled = false;
    let received = 0;
    const fail = (error: AttachmentMultipartError) => {
      failure ??= error;
      for (const file of files) file.chunks = [];
    };
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > MAX_ATTACHMENT_REQUEST_BYTES) {
          callback(new AttachmentMultipartError(413, "ATTACHMENT_TOO_LARGE", "O envio completo excede o limite de 26 MB."));
        } else callback(null, chunk);
      },
    });
    function finish(error?: AttachmentMultipartError) {
      if (settled) return;
      settled = true;
      request.off("aborted", aborted);
      request.off("error", requestError);
      request.unpipe(limiter);
      limiter.unpipe(parser);
      limiter.destroy();
      if (error) {
        fail(error);
        parser.destroy();
        drainRejectedRequest(request);
        reject(error);
      } else {
        resolve(files.map((file) => ({ nomeOriginal: file.nomeOriginal, bytes: Buffer.concat(file.chunks, file.size) })));
      }
    }
    function aborted() { finish(new AttachmentMultipartError(422, "VALIDATION_ERROR", "O envio das imagens foi interrompido.")); }
    function requestError() { finish(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Não foi possível receber as imagens.")); }

    parser.on("file", (field, stream, info) => {
      const entry = { nomeOriginal: info.filename ?? "", chunks: [] as Buffer[], size: 0 };
      files.push(entry);
      if (field !== "images" || !info.filename?.trim()) {
        fail(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Envie somente arquivos no campo images, com nome válido."));
      }
      stream.on("data", (chunk: Buffer) => {
        entry.size += chunk.length;
        if (entry.size > MAX_ATTACHMENT_BYTES) {
          fail(new AttachmentMultipartError(413, "ATTACHMENT_TOO_LARGE", `A imagem ${entry.nomeOriginal} excede o limite de 5 MB.`));
        }
        if (!failure) entry.chunks.push(chunk);
      });
      stream.on("limit", () => fail(new AttachmentMultipartError(413, "ATTACHMENT_TOO_LARGE", `A imagem ${entry.nomeOriginal} excede o limite de 5 MB.`)));
      stream.on("error", () => finish(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Conteúdo multipart incompleto ou inválido.")));
    });
    parser.on("filesLimit", () => fail(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Envie no máximo 5 imagens por lote.")));
    parser.on("fieldsLimit", () => fail(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Envie somente imagens no corpo; informe a chave no cabeçalho Idempotency-Key.")));
    parser.on("partsLimit", () => fail(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Quantidade de partes multipart excedida.")));
    parser.on("error", () => finish(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Conteúdo multipart incompleto ou inválido.")));
    parser.on("close", () => {
      if (!files.length && !failure) fail(new AttachmentMultipartError(422, "VALIDATION_ERROR", "Envie de 1 a 5 imagens."));
      finish(failure);
    });
    limiter.on("error", (error) => finish(error instanceof AttachmentMultipartError ? error : new AttachmentMultipartError(422, "VALIDATION_ERROR", "Falha na leitura do envio.")));
    request.once("aborted", aborted);
    request.once("error", requestError);
    request.pipe(limiter).pipe(parser);
  });
}
