import sharp from "sharp";

export const MAX_ATTACHMENT_BYTES = 5_000_000;
export const MAX_ATTACHMENT_PIXELS = 40_000_000;
export type AttachmentMimeType = "image/jpeg" | "image/png" | "image/webp";

export class InvalidAttachmentImageError extends Error {
  constructor(
    readonly code: "ATTACHMENT_TOO_LARGE" | "INVALID_ATTACHMENT_IMAGE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InvalidAttachmentImageError";
  }
}

/** Não confia em nome ou MIME externo. Decodifica todos os pixels/quadros. */
export async function validateAttachmentImage(bytes: Buffer): Promise<{
  mimeType: AttachmentMimeType;
  tamanhoBytes: number;
}> {
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new InvalidAttachmentImageError("ATTACHMENT_TOO_LARGE", "A imagem excede o limite de 5 MB.");
  }
  const format = detectFormat(bytes);
  if (!format) {
    throw new InvalidAttachmentImageError("INVALID_ATTACHMENT_IMAGE", "Envie uma imagem JPEG, PNG ou WebP válida.");
  }
  try {
    const decoder = sharp(bytes, {
      failOn: "warning", limitInputPixels: MAX_ATTACHMENT_PIXELS, animated: true,
    });
    const metadata = await decoder.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height) {
      throw new Error("Invalid image format or dimensions");
    }
    const pixels = metadata.width * (metadata.pageHeight ?? metadata.height) * (metadata.pages ?? 1);
    if (pixels > MAX_ATTACHMENT_PIXELS) {
      throw new InvalidAttachmentImageError("INVALID_ATTACHMENT_IMAGE", "A imagem excede o limite de 40 milhões de pixels, incluindo os quadros de animação.");
    }
    // metadata() sozinho não comprova integridade dos dados comprimidos.
    await decoder.raw().toBuffer();
    return { mimeType: format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : "image/webp", tamanhoBytes: bytes.length };
  } catch (error) {
    if (error instanceof InvalidAttachmentImageError) throw error;
    throw new InvalidAttachmentImageError("INVALID_ATTACHMENT_IMAGE", "A imagem está corrompida, incompleta ou excede os limites de decodificação.", { cause: error });
  }
}

function detectFormat(bytes: Buffer): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}
