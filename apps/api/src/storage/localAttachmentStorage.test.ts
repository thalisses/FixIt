import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAttachmentStorage } from "./localAttachmentStorage.js";
import { AttachmentStorageError, UnsafeAttachmentPathError } from "./attachmentStorage.js";

let root: string;
let bytes: Buffer;
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "fixit-attachments-test-"));
  bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).png().toBuffer();
});
afterEach(async () => {
  // Remove exclusivamente o diretório criado por este teste e validado abaixo.
  if (!resolve(root).startsWith(join(resolve(tmpdir()), "fixit-attachments-test-"))) {
    throw new Error("Unsafe test cleanup path");
  }
  await fs.rm(root, { recursive: true, force: true });
});

describe("local attachment storage", () => {
  it("prepares, exclusively confirms, reads unchanged bytes and compensates", async () => {
    const storage = createLocalAttachmentStorage(root);
    const prepared = await storage.prepare(bytes);
    expect(prepared).toMatchObject({ mimeType: "image/png", tamanhoBytes: bytes.length });
    expect(prepared.storageKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(await fs.readFile(join(root, "temporary", prepared.storageKey))).toEqual(bytes);
    await expect(storage.read(prepared.storageKey)).rejects.toBeInstanceOf(AttachmentStorageError);
    await storage.confirm(prepared.storageKey);
    expect(await storage.read(prepared.storageKey)).toEqual(bytes);
    await expect(fs.stat(join(root, "temporary", prepared.storageKey))).rejects.toMatchObject({ code: "ENOENT" });
    // Uma nova instância não depende de estado em memória.
    expect(await createLocalAttachmentStorage(root).read(prepared.storageKey)).toEqual(bytes);
    await storage.remove(prepared.storageKey);
    await storage.remove(prepared.storageKey);
    await expect(storage.read(prepared.storageKey)).rejects.toBeInstanceOf(AttachmentStorageError);
  });

  it("can discard a prepared file and generates independent random names", async () => {
    const storage = createLocalAttachmentStorage(root);
    const first = await storage.prepare(bytes);
    const second = await storage.prepare(bytes);
    expect(first.storageKey).not.toBe(second.storageKey);
    await storage.remove(first.storageKey);
    expect(await fs.readdir(join(root, "temporary"))).toEqual([second.storageKey]);
  });

  it.each(["../outside", "..\\outside", "/etc/passwd", "C:\\outside", "x/y", "x\0y", "", "not-a-uuid"])("rejects unsafe key %s for every operation", async (key) => {
    const storage = createLocalAttachmentStorage(root);
    for (const operation of [storage.confirm, storage.read, storage.remove]) {
      await expect(operation(key)).rejects.toBeInstanceOf(UnsafeAttachmentPathError);
    }
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("rejects a relative root", () => {
    expect(() => createLocalAttachmentStorage("uploads")).toThrow(UnsafeAttachmentPathError);
  });

  it("rejects symbolic-link directories before writing", async () => {
    const io = { ...fs, lstat: vi.fn(async (path: Parameters<typeof fs.lstat>[0]) => {
      const stat = await fs.lstat(path);
      stat.isSymbolicLink = () => true;
      return stat;
    }) };
    await expect(createLocalAttachmentStorage(root, io).prepare(bytes)).rejects.toBeInstanceOf(UnsafeAttachmentPathError);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("rejects invalid content without creating storage directories", async () => {
    await expect(createLocalAttachmentStorage(root).prepare(Buffer.from("fake png")))
      .rejects.toMatchObject({ code: "INVALID_ATTACHMENT_IMAGE" });
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("wraps disk failures with operation and cause", async () => {
    const failure = Object.assign(new Error("Disk full"), { code: "ENOSPC" });
    const io = { ...fs, open: vi.fn<typeof fs.open>().mockRejectedValue(failure) };
    await expect(createLocalAttachmentStorage(root, io).prepare(bytes))
      .rejects.toMatchObject({ operation: "prepare", cause: failure });
  });

  it("removes an incomplete file after a write failure", async () => {
    const failure = new Error("Write failed");
    const io = { ...fs, open: vi.fn<typeof fs.open>(async (...args) => {
      const handle = await fs.open(...args);
      vi.spyOn(handle, "writeFile").mockRejectedValue(failure);
      return handle;
    }) };
    await expect(createLocalAttachmentStorage(root, io).prepare(bytes))
      .rejects.toMatchObject({ operation: "prepare", cause: failure });
    expect(await fs.readdir(join(root, "temporary"))).toEqual([]);
  });

  it("does not overwrite a previously published file", async () => {
    const storage = createLocalAttachmentStorage(root);
    const { storageKey } = await storage.prepare(bytes);
    await fs.writeFile(join(root, "permanent", storageKey), "existing", { flag: "wx" });
    await expect(storage.confirm(storageKey)).rejects.toMatchObject({ operation: "confirm", cause: { code: "EEXIST" } });
    expect(await fs.readFile(join(root, "permanent", storageKey), "utf8")).toBe("existing");
  });

  it("reports failed confirmation and allows compensation in both directories", async () => {
    const storage = createLocalAttachmentStorage(root);
    const { storageKey } = await storage.prepare(bytes);
    const io = { ...fs, unlink: vi.fn<typeof fs.unlink>().mockRejectedValue(new Error("Unlink failed")) };
    await expect(createLocalAttachmentStorage(root, io).confirm(storageKey)).rejects.toMatchObject({ operation: "confirm", storageKey });
    expect(await fs.readFile(join(root, "permanent", storageKey))).toEqual(bytes);
    await storage.remove(storageKey);
    expect(await fs.readdir(join(root, "temporary"))).toEqual([]);
    expect(await fs.readdir(join(root, "permanent"))).toEqual([]);
  });

  it("reports read failures with their original cause", async () => {
    const storage = createLocalAttachmentStorage(root);
    const { storageKey } = await storage.prepare(bytes);
    await storage.confirm(storageKey);
    const failure = new Error("Read denied");
    const io = { ...fs, open: vi.fn<typeof fs.open>().mockRejectedValue(failure) };
    await expect(createLocalAttachmentStorage(root, io).read(storageKey))
      .rejects.toMatchObject({ operation: "read", cause: failure });
  });

  it("refuses file symlinks before reading or confirming", async () => {
    const storage = createLocalAttachmentStorage(root);
    const { storageKey } = await storage.prepare(bytes);
    const io = { ...fs, lstat: vi.fn(async (path: Parameters<typeof fs.lstat>[0]) => {
      const stat = await fs.lstat(path);
      if (String(path).endsWith(storageKey)) stat.isSymbolicLink = () => true;
      return stat;
    }) };
    await expect(createLocalAttachmentStorage(root, io).confirm(storageKey)).rejects.toBeInstanceOf(UnsafeAttachmentPathError);
    await storage.confirm(storageKey);
    await expect(createLocalAttachmentStorage(root, io).read(storageKey)).rejects.toBeInstanceOf(UnsafeAttachmentPathError);
    await expect(createLocalAttachmentStorage(root, io).remove(storageKey)).rejects.toBeInstanceOf(AttachmentStorageError);
    expect(await storage.read(storageKey)).toEqual(bytes);
  });

  it("keeps both causes when writing and compensating fail", async () => {
    const failure = new Error("Write failed");
    const cleanupFailure = new Error("Cleanup failed");
    const io = {
      ...fs,
      open: vi.fn<typeof fs.open>(async (...args) => {
        const handle = await fs.open(...args);
        vi.spyOn(handle, "writeFile").mockRejectedValue(failure);
        return handle;
      }),
      unlink: vi.fn<typeof fs.unlink>().mockRejectedValue(cleanupFailure),
    };
    await expect(createLocalAttachmentStorage(root, io).prepare(bytes))
      .rejects.toMatchObject({ operation: "prepare", cause: { errors: [failure, cleanupFailure] } });
  });

  it("reports removal failures instead of hiding them", async () => {
    const { storageKey } = await createLocalAttachmentStorage(root).prepare(bytes);
    const io = { ...fs, unlink: vi.fn<typeof fs.unlink>().mockRejectedValue(new Error("Access denied")) };
    await expect(createLocalAttachmentStorage(root, io).remove(storageKey)).rejects.toMatchObject({ operation: "remove", storageKey });
  });
});
