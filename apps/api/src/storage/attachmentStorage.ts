import type { AttachmentMimeType } from "../validators/attachmentImageValidator.js";

export interface PreparedAttachment {
  storageKey: string;
  mimeType: AttachmentMimeType;
  tamanhoBytes: number;
}

/** Operações por arquivo; a transação de lote e a autorização pertencem ao serviço. */
export interface AttachmentStorage {
  prepare(bytes: Buffer): Promise<PreparedAttachment>;
  confirm(storageKey: string): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  /** Remove temporário e definitivo da chave; ausências são toleradas para compensação. */
  remove(storageKey: string): Promise<void>;
}

export class AttachmentStorageError extends Error {
  constructor(
    readonly operation: "prepare" | "confirm" | "read" | "remove",
    readonly storageKey: string | undefined,
    options?: ErrorOptions,
  ) {
    super("Não foi possível acessar o armazenamento de anexos.", options);
    this.name = "AttachmentStorageError";
  }
}

export class UnsafeAttachmentPathError extends Error {
  constructor() {
    super("Chave ou diretório de armazenamento de anexos inválido.");
    this.name = "UnsafeAttachmentPathError";
  }
}
