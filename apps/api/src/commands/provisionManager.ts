import "dotenv/config";
import { StringDecoder } from "node:string_decoder";
import { createDataSource } from "../config/database.js";
import { createProvisionManagerRepository } from "../repositories/provisionManagerRepository.js";
import { createProvisionManagerService } from "../services/provisionManagerService.js";

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || process.argv.length !== 3) {
    throw new Error(
      "Usage: npm run db:provision-manager -- <existing-account-email>",
    );
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this command from an interactive terminal.");
  }

  const password = await readHiddenPassword("Senha inicial: ");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const dataSource = createDataSource(databaseUrl);
  try {
    await dataSource.initialize();
    await dataSource.runMigrations();
    const result = await createProvisionManagerService(
      createProvisionManagerRepository(dataSource),
    ).provision(email, password);
    if (result.role !== "GESTOR") {
      throw new Error("Provisioning did not create an active Gestor.");
    }

    process.stdout.write("Gestor inicial provisionado.\n");
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

async function readHiddenPassword(prompt: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  const decoder = new StringDecoder("utf8");

  output.write(prompt);
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let password = "";
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };
    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Provisioning cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(password);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = Array.from(password).slice(0, -1).join("");
        } else if (character >= " ") {
          password += character;
        }
      }
    };

    input.on("data", onData);
  });
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  console.error(`Provisioning failed: ${message}`);
  process.exitCode = 1;
});
