import { createHash } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User, UserRole } from "../entities/User.js";
import type { SessionRepository } from "../services/sessionService.js";
import type { UserManagementRepository } from "../services/userManagementService.js";
import type { UserRepository } from "../services/userService.js";

let server: Server | undefined;
let passwordHash: string;
const storedSessions: AuthSession[] = [];

const user = new User();
Object.assign(user, {
  id: "user-1",
  fullName: "Ana Silva",
  email: "ana@example.edu",
  passwordHash: "",
  cpf: null,
  cityUf: null,
  institutionId: "UEM",
  role: UserRole.CLIENTE,
  isActive: true,
});

const userRepository = {
  create: (input) => Object.assign(new User(), input),
  findOneBy: vi.fn<UserRepository["findOneBy"]>(),
  save: vi.fn<UserRepository["save"]>(),
} satisfies UserRepository;

const sessionRepository: SessionRepository = {
  create: (input) =>
    Object.assign(new AuthSession(), input, {
      id: `session-${storedSessions.length + 1}`,
      createdAt: new Date(),
    }),
  save: async (session) => {
    const index = storedSessions.findIndex((stored) => stored.id === session.id);
    if (index === -1) {
      storedSessions.push(session);
    } else {
      storedSessions[index] = session;
    }
    return session;
  },
  findOneByTokenHash: async (tokenHash) =>
    storedSessions.find((session) => session.tokenHash === tokenHash) ?? null,
  findUserById: async (userId) => (userId === user.id ? user : null),
};
const userManagementRepository: UserManagementRepository = {
  list: async () => ({ users: [], totalItems: 0 }),
  transaction: async <T>() => {
    throw new Error("User management is not used in this test.");
  },
};

beforeAll(async () => {
  passwordHash = await bcrypt.hash("correct-password", 4);
});

beforeEach(() => {
  Object.assign(user, { passwordHash, isActive: true, role: UserRole.CLIENTE });
  storedSessions.length = 0;
  userRepository.findOneBy.mockImplementation(async ({ email }) =>
    email === user.email ? user : null,
  );
});

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
});

async function startServer(secureCookies = false): Promise<string> {
  server = createApp(
    async () => {},
    userRepository,
    sessionRepository,
    userManagementRepository,
    { secureCookies, webOrigin: "http://localhost:5173" },
  ).listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function login(
  baseUrl: string,
  input: Record<string, unknown> = {
    email: user.email,
    password: "correct-password",
  },
): Promise<Response> {
  return fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

describe("session routes", () => {
  it("creates an opaque HttpOnly session and returns the current public user", async () => {
    const baseUrl = await startServer();
    const response = await login(baseUrl);
    const cookie = response.headers.get("set-cookie") ?? "";
    const token = cookie.match(/fixit_session=([^;]+)/)?.[1];
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storedSessions[0]?.tokenHash).toBe(
      createHash("sha256").update(token ?? "").digest("hex"),
    );
    expect(body).toEqual({
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: UserRole.CLIENTE,
        },
      },
    });
    expect(body).not.toHaveProperty("data.user.passwordHash");

    const currentResponse = await fetch(`${baseUrl}/api/sessions/current`, {
      headers: { cookie: `fixit_session=${token}` },
    });
    expect(currentResponse.status).toBe(200);
    expect(await currentResponse.json()).toEqual(body);
  });

  it("uses the same generic response for unknown accounts and wrong passwords", async () => {
    const baseUrl = await startServer();
    const wrongPassword = await login(baseUrl, {
      email: user.email,
      password: "wrong-password",
    });
    const unknownAccount = await login(baseUrl, {
      email: "missing@example.edu",
      password: "wrong-password",
    });
    const wrongPasswordBody = await wrongPassword.json();
    const unknownAccountBody = await unknownAccount.json();

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPasswordBody).toEqual(unknownAccountBody);
    expect(wrongPasswordBody).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "E-mail ou senha inválidos.",
      },
    });
  });

  it("sets a seven-day persistent cookie only when rememberMe is selected", async () => {
    const baseUrl = await startServer(true);
    const response = await login(baseUrl, {
      email: user.email,
      password: "correct-password",
      rememberMe: true,
    });
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(201);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).toMatch(/Expires=/);
    expect(storedSessions[0]?.expiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(storedSessions[0]?.expiresAt?.getTime()).toBeLessThanOrEqual(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    );
  });

  it("revokes the current session on logout and rejects it afterward", async () => {
    const baseUrl = await startServer();
    const loginResponse = await login(baseUrl);
    const token = loginResponse.headers
      .get("set-cookie")
      ?.match(/fixit_session=([^;]+)/)?.[1];
    expect(token).toBeDefined();

    const logoutResponse = await fetch(`${baseUrl}/api/sessions/current`, {
      method: "DELETE",
      headers: {
        cookie: `fixit_session=${token}`,
        origin: "http://localhost:5173",
      },
    });
    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(storedSessions[0]?.revokedAt).toBeInstanceOf(Date);

    const currentResponse = await fetch(`${baseUrl}/api/sessions/current`, {
      headers: { cookie: `fixit_session=${token}` },
    });
    expect(currentResponse.status).toBe(401);
  });

  it("rejects state-changing cookie requests from missing or untrusted origins", async () => {
    const baseUrl = await startServer();
    const loginResponse = await login(baseUrl);
    const token = loginResponse.headers
      .get("set-cookie")
      ?.match(/fixit_session=([^;]+)/)?.[1];
    expect(token).toBeDefined();

    const missingOrigin = await fetch(`${baseUrl}/api/sessions/current`, {
      method: "DELETE",
      headers: { cookie: `fixit_session=${token}` },
    });
    const untrustedOrigin = await fetch(`${baseUrl}/api/sessions/current`, {
      method: "DELETE",
      headers: {
        cookie: `fixit_session=${token}`,
        origin: "https://attacker.example",
      },
    });

    expect(missingOrigin.status).toBe(403);
    expect(untrustedOrigin.status).toBe(403);
    expect(storedSessions[0]?.revokedAt).toBeNull();
  });

  it("answers preflight requests only for the configured credentialed origin", async () => {
    const baseUrl = await startServer();
    const allowed = await fetch(`${baseUrl}/api/sessions`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    const denied = await fetch(`${baseUrl}/api/sessions`, {
      method: "OPTIONS",
      headers: {
        origin: "https://attacker.example",
        "access-control-request-method": "POST",
      },
    });

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects malformed, missing, and inactive-user sessions", async () => {
    const baseUrl = await startServer();
    const anonymousResponse = await fetch(`${baseUrl}/api/sessions/current`);
    const malformedResponse = await fetch(`${baseUrl}/api/sessions/current`, {
      headers: { cookie: "fixit_session=not-a-valid-token" },
    });
    expect(anonymousResponse.status).toBe(401);
    expect(malformedResponse.status).toBe(401);

    user.isActive = false;
    const inactiveResponse = await login(baseUrl);
    expect(inactiveResponse.status).toBe(401);
    expect(await inactiveResponse.json()).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "E-mail ou senha inválidos.",
      },
    });
  });
});
