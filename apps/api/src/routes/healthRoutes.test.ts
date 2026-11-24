import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User } from "../entities/User.js";
import type { DatabaseHealthCheck } from "./healthRoutes.js";
import type { SessionRepository } from "../services/sessionService.js";
import type { UserRepository } from "../services/userService.js";
import type { UserManagementRepository } from "../services/userManagementService.js";

let server: Server | undefined;
let webDirectory: string | undefined;

const userRepository: UserRepository = {
  create: (input) => Object.assign(new User(), input),
  findOneBy: async () => null,
  save: async (user) => Object.assign(user, { id: "user-1" }),
};
const sessionRepository: SessionRepository = {
  create: (input) => Object.assign(new AuthSession(), input),
  save: async (session) => session,
  findOneByTokenHash: async () => null,
  findUserById: async () => null,
};
const userManagementRepository: UserManagementRepository = {
  list: async () => ({ users: [], totalItems: 0 }),
  transaction: async <T>() => {
    throw new Error("User management is not used in this test.");
  },
};

afterEach(async () => {
  const currentServer = server;
  server = undefined;

  if (currentServer?.listening) {
    await new Promise<void>((resolve, reject) => {
      currentServer.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  if (webDirectory) {
    await rm(webDirectory, { recursive: true, force: true });
    webDirectory = undefined;
  }
});

async function startServer(
  checkDatabase: DatabaseHealthCheck,
  staticWebDirectory?: string,
): Promise<string> {
  server = createApp(
    checkDatabase,
    userRepository,
    sessionRepository,
    userManagementRepository,
    {
      secureCookies: false,
      webOrigin: "http://localhost:5173",
      webDirectory: staticWebDirectory,
    },
  ).listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

describe("health routes", () => {
  it("reports that the process is live without checking the database", async () => {
    const checkDatabase = vi.fn<DatabaseHealthCheck>();
    const baseUrl = await startServer(checkDatabase);

    const response = await fetch(`${baseUrl}/health/live`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it("reports ready when the database check succeeds", async () => {
    const checkDatabase = vi.fn<DatabaseHealthCheck>().mockResolvedValue();
    const baseUrl = await startServer(checkDatabase);

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it("returns a generic unavailable response when the database check fails", async () => {
    const checkDatabase = vi
      .fn<DatabaseHealthCheck>()
      .mockRejectedValue(new Error("private connection details"));
    const baseUrl = await startServer(checkDatabase);

    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain('"database":"unavailable"');
    expect(body).not.toContain("private connection details");
  });

  it("serves the frontend fallback without masking API or health paths", async () => {
    webDirectory = await mkdtemp(join(tmpdir(), "fixit-web-"));
    await writeFile(join(webDirectory, "index.html"), "<main>FixIt web</main>");
    const baseUrl = await startServer(vi.fn<DatabaseHealthCheck>(), webDirectory);

    const rootResponse = await fetch(`${baseUrl}/`);
    const appRouteResponse = await fetch(`${baseUrl}/solicitations/7`);
    const healthResponse = await fetch(`${baseUrl}/health/live`);
    const unknownApiResponse = await fetch(`${baseUrl}/api/not-found`);

    expect(await rootResponse.text()).toContain("FixIt web");
    expect(await appRouteResponse.text()).toContain("FixIt web");
    expect(await healthResponse.json()).toEqual({ status: "ok" });
    expect(unknownApiResponse.status).toBe(404);
    expect(await unknownApiResponse.text()).not.toContain("FixIt web");
  });

  it("does not expose attachment endpoints without attachment storage", async () => {
    const baseUrl = await startServer(vi.fn<DatabaseHealthCheck>());

    const response = await fetch(`${baseUrl}/api/solicitations/1/attachments`, {
      method: "POST",
    });

    expect(response.status).toBe(404);
  });
});