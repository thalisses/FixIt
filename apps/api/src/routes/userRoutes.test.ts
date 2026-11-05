import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User } from "../entities/User.js";
import type { SessionRepository } from "../services/sessionService.js";
import type { UserManagementRepository } from "../services/userManagementService.js";
import type { UserRepository } from "../services/userService.js";

let server: Server | undefined;

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

async function startServer(userRepository: UserRepository): Promise<string> {
  server = createApp(
    async () => {},
    userRepository,
    sessionRepository,
    userManagementRepository,
    { secureCookies: false, webOrigin: "http://localhost:5173" },
  ).listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

function createRepository(): UserRepository {
  return {
    create: (input) => Object.assign(new User(), input),
    findOneBy: vi.fn(async () => null),
    save: vi.fn(async (user) => Object.assign(user, { id: "user-1" })),
  };
}

const validRegistration = {
  fullName: "Ana Silva",
  email: " ANA@EXAMPLE.EDU ",
  password: "password123",
  institutionId: "UEM",
};

describe("user registration route", () => {
  it("creates an active Cliente and returns no credentials", async () => {
    const repository = createRepository();
    const baseUrl = await startServer(repository);

    const response = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validRegistration, role: "GESTOR" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      data: {
        user: {
          id: "user-1",
          fullName: "Ana Silva",
          email: "ana@example.edu",
          institutionId: "UEM",
          role: "CLIENTE",
        },
      },
    });
    expect(body).not.toHaveProperty("data.user.passwordHash");
    const savedUser = vi.mocked(repository.save).mock.calls[0]?.[0];
    expect(savedUser?.isActive).toBe(true);
    expect(savedUser?.passwordHash).not.toBe(validRegistration.password);
  });

  it("rejects invalid input without persisting an account", async () => {
    const repository = createRepository();
    const baseUrl = await startServer(repository);
    const response = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...validRegistration,
        institutionId: "UNKNOWN",
      }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados de cadastro inválidos.",
      },
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("returns a conflict for a duplicate email", async () => {
    const repository = createRepository();
    vi.mocked(repository.findOneBy).mockResolvedValueOnce(new User());
    const baseUrl = await startServer(repository);
    const response = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRegistration),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "EMAIL_ALREADY_EXISTS",
        message: "Já existe uma conta com este e-mail.",
      },
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("returns a generic server error when persistence fails", async () => {
    const repository = createRepository();
    vi.mocked(repository.save).mockRejectedValueOnce(
      new Error("private database details"),
    );
    const baseUrl = await startServer(repository);
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validRegistration),
      });

      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).toContain('"code":"INTERNAL_SERVER_ERROR"');
      expect(body).not.toContain("private database details");
      expect(logError).toHaveBeenCalledOnce();
    } finally {
      logError.mockRestore();
    }
  });
});
