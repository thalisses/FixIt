import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "../entities/User.js";
import type {
  PublicSessionUser,
  SessionService,
} from "../services/sessionService.js";
import { createRequireAuth } from "./requireAuth.js";
import { createRequireRole } from "./requireRole.js";
import { sessionCookieName } from "./sessionCookie.js";

let server: Server | undefined;

const client: PublicSessionUser = {
  id: "client-1",
  fullName: "Ana Silva",
  email: "ana@example.edu",
  role: UserRole.CLIENTE,
};
const manager: PublicSessionUser = {
  id: "manager-1",
  fullName: "Bruno Souza",
  email: "bruno@example.edu",
  role: UserRole.GESTOR,
};

afterEach(async () => {
  const currentServer = server;
  server = undefined;

  if (!currentServer?.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    currentServer.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

async function startServer(): Promise<string> {
  const sessionUsers = new Map([
    ["client-token", client],
    ["manager-token", manager],
  ]);
  const sessionService: SessionService = {
    create: vi.fn(),
    getCurrent: vi.fn(async (token) => sessionUsers.get(token) ?? null),
    revoke: vi.fn(),
  };
  const app = express();
  app.get(
    "/users",
    createRequireAuth(sessionService),
    createRequireRole(UserRole.GESTOR),
    (request, response) => {
      response.status(200).json({ userId: request.authUser?.id });
    },
  );
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

describe("authentication and role middleware", () => {
  it("returns 401 when a session cookie is absent or invalid", async () => {
    const baseUrl = await startServer();

    const missingCookie = await fetch(`${baseUrl}/users`);
    const invalidCookie = await fetch(`${baseUrl}/users`, {
      headers: { cookie: `${sessionCookieName}=invalid-token` },
    });

    expect(missingCookie.status).toBe(401);
    expect(invalidCookie.status).toBe(401);
  });

  it("returns 403 for an authenticated user without the required role", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/users`, {
      headers: { cookie: `${sessionCookieName}=client-token` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Você não tem permissão para esta ação.",
      },
    });
  });

  it("passes the current user through for an authorized role", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/users`, {
      headers: { cookie: `${sessionCookieName}=manager-token` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: manager.id });
  });
});
