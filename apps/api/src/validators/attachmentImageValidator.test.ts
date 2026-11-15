import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES, validateAttachmentImage } from "./attachmentImageValidator.js";

function image() {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } });
}

describe("attachment image validation with real decoding", () => {
  it.each(["jpeg", "png", "webp"] as const)("accepts and identifies %s bytes", async (format) => {
    const bytes = await image().toFormat(format).toBuffer();
    await expect(validateAttachmentImage(bytes)).resolves.toEqual({
      mimeType: `image/${format}`, tamanhoBytes: bytes.length,
    });
  });

  it.each([Buffer.alloc(0), Buffer.from("not an image"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from("GIF89a")])("rejects unsupported content", async (bytes) => {
    await expect(validateAttachmentImage(bytes)).rejects.toMatchObject({ code: "INVALID_ATTACHMENT_IMAGE" });
  });

  it.each(["jpeg", "png", "webp"] as const)("rejects truncated %s with an intact signature", async (format) => {
    const bytes = await image().toFormat(format).toBuffer();
    await expect(validateAttachmentImage(bytes.subarray(0, Math.floor(bytes.length / 2))))
      .rejects.toMatchObject({ code: "INVALID_ATTACHMENT_IMAGE" });
  });

  it("rejects corruption beyond the PNG header", async () => {
    const bytes = await image().png().toBuffer();
    const idat = bytes.indexOf(Buffer.from("IDAT"));
    bytes[idat + 5] ^= 0xff;
    await expect(validateAttachmentImage(bytes)).rejects.toMatchObject({ code: "INVALID_ATTACHMENT_IMAGE" });
  });

  it("rejects one byte over 5 MB before decoding", async () => {
    await expect(validateAttachmentImage(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)))
      .rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE" });
  });

  it("allows exactly 5 MB through the size check", async () => {
    // Padding is not an image: the boundary must reach content validation.
    await expect(validateAttachmentImage(Buffer.alloc(MAX_ATTACHMENT_BYTES)))
      .rejects.toMatchObject({ code: "INVALID_ATTACHMENT_IMAGE" });
  });

  it("rejects excessive decompressed dimensions", async () => {
    const bytes = await sharp({ create: { width: 6500, height: 6500, channels: 3, background: "white" } }).png().toBuffer();
    expect(bytes.length).toBeLessThan(MAX_ATTACHMENT_BYTES);
    await expect(validateAttachmentImage(bytes)).rejects.toMatchObject({ code: "INVALID_ATTACHMENT_IMAGE" });
  });
});
