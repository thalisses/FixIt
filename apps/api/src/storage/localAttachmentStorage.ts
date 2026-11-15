import { randomUUID } from "node:crypto";
import { constants, type PathLike, type Stats } from "node:fs";
import * as fs from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { MAX_ATTACHMENT_BYTES, validateAttachmentImage } from "../validators/attachmentImageValidator.js";
import {
  AttachmentStorageError, UnsafeAttachmentPathError,
  type AttachmentStorage,
} from "./attachmentStorage.js";

type StorageFileSystem = Pick<typeof fs, "mkdir" | "realpath" | "open" | "link" | "unlink"> & {
  lstat(path: PathLike): Promise<Stats>;
};
const SAFE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createLocalAttachmentStorage(
  uploadDir: string,
  io: StorageFileSystem = fs,
): AttachmentStorage {
  if (!isAbsolute(uploadDir) || uploadDir.includes("\0")) throw new UnsafeAttachmentPathError();
  const root = resolve(uploadDir);

  function checkKey(key: string): void {
    if (!SAFE_KEY.test(key)) throw new UnsafeAttachmentPathError();
  }

  async function directories() {
    await io.mkdir(root, { recursive: true, mode: 0o700 });
    if ((await io.lstat(root)).isSymbolicLink()) throw new UnsafeAttachmentPathError();
    const canonicalRoot = await io.realpath(root);
    const temporary = join(canonicalRoot, "temporary");
    const permanent = join(canonicalRoot, "permanent");
    for (const directory of [temporary, permanent]) {
      await io.mkdir(directory, { recursive: true, mode: 0o700 });
      const stat = await io.lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory() || await io.realpath(directory) !== directory) {
        throw new UnsafeAttachmentPathError();
      }
    }
    return { temporary, permanent };
  }

  async function requireRegularFile(path: string) {
    const stat = await io.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new UnsafeAttachmentPathError();
  }

  async function removeIfPresent(path: string) {
    try {
      await requireRegularFile(path);
      await io.unlink(path);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }

  return {
    async prepare(input) {
      if (input.length > MAX_ATTACHMENT_BYTES) await validateAttachmentImage(input);
      // Não mantém referência mutável do chamador durante a validação e escrita.
      const bytes = Buffer.from(input);
      const image = await validateAttachmentImage(bytes);
      const key = randomUUID();
      let path: string | undefined;
      let ownsFile = false;
      try {
        const { temporary } = await directories();
        path = join(temporary, key);
        const handle = await io.open(path, "wx", 0o600);
        ownsFile = true;
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        return { storageKey: key, ...image };
      } catch (error) {
        let cause = error;
        if (ownsFile && path) {
          try { await removeIfPresent(path); } catch (cleanupError) {
            cause = new AggregateError([error, cleanupError], "Falha de escrita e de compensação.");
          }
        }
        if (error instanceof UnsafeAttachmentPathError) throw error;
        throw new AttachmentStorageError("prepare", key, { cause });
      }
    },

    async confirm(key) {
      checkKey(key);
      try {
        const { temporary, permanent } = await directories();
        const source = join(temporary, key);
        await requireRegularFile(source);
        // Mesmo volume; publicação exclusiva sem sobrescrever o destino.
        await io.link(source, join(permanent, key));
        await io.unlink(source);
      } catch (error) {
        if (error instanceof UnsafeAttachmentPathError) throw error;
        throw new AttachmentStorageError("confirm", key, { cause: error });
      }
    },

    async read(key) {
      checkKey(key);
      try {
        const { permanent } = await directories();
        const path = join(permanent, key);
        await requireRegularFile(path);
        const handle = await io.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size > MAX_ATTACHMENT_BYTES) throw new Error("Invalid stored file");
          return await handle.readFile();
        } finally { await handle.close(); }
      } catch (error) {
        if (error instanceof UnsafeAttachmentPathError) throw error;
        throw new AttachmentStorageError("read", key, { cause: error });
      }
    },

    async remove(key) {
      checkKey(key);
      try {
        const { temporary, permanent } = await directories();
        const results = await Promise.allSettled([
          removeIfPresent(join(temporary, key)), removeIfPresent(join(permanent, key)),
        ]);
        const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failures.length) throw new AggregateError(failures.map((result) => result.reason));
      } catch (error) {
        if (error instanceof UnsafeAttachmentPathError) throw error;
        throw new AttachmentStorageError("remove", key, { cause: error });
      }
    },
  };
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
