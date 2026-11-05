import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { User, UserRole } from "../entities/User.js";
import { sessionCookieName } from "../middleware/sessionCookie.js";
import type {
  PublicSessionUser,
  SessionService,
} from "../services/sessionService.js";
import {
  createUserManagementService,
  type UserManagementRepository,
} from "../services/userManagementService.js";
import { createUserManagementRoutes } from "./userManagementRoutes.js";

const webOrigin = "http://localhost:5173";
const managerId = "00000000-0000-4000-8000-000000000001";
const clientId = "00000000-0000-4000-8000-000000000002";
let server: Server | undefined;

function createUser(id: string, role: UserRole): User {
  const user = new User();
  Object.assign(user, {
    id,
    fullName: `${id} Name`,
    email: `${id}@example.edu`,
    passwordHash: "private-hash",
    cpf: null,
    cityUf: null,
    institutionId: "UEM",
    role,
    isActive: true,
  });
  return user;
}

async function startServer(users: User[]): Promise<string> {
  const sessions = new Map<string, PublicSessionUser>(
    users.map((user) => [
      `${user.id}-token`,
      {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    ]),
  );
  const sessionService: SessionService = {
    create: async () => {
      throw new Error("Session creation is not used in this test.");
    },
    getCurrent: async (token) => sessions.get(token) ?? null,
    revoke: async () => false,
  };
  const repository: UserManagementRepository = {
    list: async (page, pageSize) => ({
      users: users.slice((page - 1) * pageSize, page * pageSize),
      totalItems: users.length,
    }),
    transaction: (work) =>
      work({
        lockRoleChanges: async () => {},
        getActiveManagers: async () =>
          users.filter(
            (user) => user.isActive && user.role === UserRole.GESTOR,
          ),
        findByIdForUpdate: async (userId) =>
          users.find((user) => user.id === userId) ?? null,
        save: async (user) => user,
      }),
  };
  const app = express();
  app.use(express.json());
  app.use(
    createUserManagementRoutes(
      createUserManagementService(repository),
      sessionService,
      webOrigin,
    ),
  );
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

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

describe("user management routes", () => {
  it("requires a manager and returns a paginated, credential-free list", async () => {
    const manager = createUser(managerId, UserRole.GESTOR);
    const client = createUser(clientId, UserRole.CLIENTE);
    const baseUrl = await startServer([manager, client]);

    const unauthenticated = await fetch(`${baseUrl}/api/users`);
    const forbidden = await fetch(`${baseUrl}/api/users`, {
      headers: { cookie: `${sessionCookieName}=${client.id}-token` },
    });
    const listed = await fetch(`${baseUrl}/api/users?page=2&pageSize=1`, {
      headers: { cookie: `${sessionCookieName}=${manager.id}-token` },
    });
    const body = await listed.json();

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(listed.status).toBe(200);
    expect(body).toEqual({
      data: [
        {
          id: client.id,
          fullName: client.fullName,
          email: client.email,
          institutionId: "UEM",
          role: UserRole.CLIENTE,
        },
      ],
      pagination: {
        page: 2,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2,
      },
    });
    expect(body).not.toHaveProperty("data[0].passwordHash");
  });

  it("allows a Gestor to promote a Cliente directly to Gestor", async () => {
    const manager = createUser(managerId, UserRole.GESTOR);
    const client = createUser(clientId, UserRole.CLIENTE);
    const baseUrl = await startServer([manager, client]);

    const response = await fetch(
      `${baseUrl}/api/users/${client.id}/role`,
      {
        method: "PATCH",
        headers: {
          cookie: `${sessionCookieName}=${manager.id}-token`,
          origin: webOrigin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: UserRole.GESTOR }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        user: { id: client.id, role: UserRole.GESTOR },
      },
    });
    expect(client.role).toBe(UserRole.GESTOR);
  });

  it("validates pagination and returns a conflict for the last Gestor", async () => {
    const manager = createUser(managerId, UserRole.GESTOR);
    const baseUrl = await startServer([manager]);

    const invalidPagination = await fetch(
      `${baseUrl}/api/users?pageSize=101`,
      { headers: { cookie: `${sessionCookieName}=${manager.id}-token` } },
    );
    const lastManagerChange = await fetch(
      `${baseUrl}/api/users/${manager.id}/role`,
      {
        method: "PATCH",
        headers: {
          cookie: `${sessionCookieName}=${manager.id}-token`,
          origin: webOrigin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: UserRole.MANUTENTOR }),
      },
    );

    expect(invalidPagination.status).toBe(422);
    expect(lastManagerChange.status).toBe(409);
    expect(await lastManagerChange.json()).toEqual({
      error: {
        code: "LAST_MANAGER_REQUIRED",
        message: "A instituição precisa manter ao menos um Gestor ativo.",
      },
    });
  });

  it("rejects profile changes without an allowed origin", async () => {
    const manager = createUser(managerId, UserRole.GESTOR);
    const client = createUser(clientId, UserRole.CLIENTE);
    const baseUrl = await startServer([manager, client]);

    const response = await fetch(
      `${baseUrl}/api/users/${client.id}/role`,
      {
        method: "PATCH",
        headers: {
          cookie: `${sessionCookieName}=${manager.id}-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: UserRole.MANUTENTOR }),
      },
    );

    expect(response.status).toBe(403);
    expect(client.role).toBe(UserRole.CLIENTE);
  });
});
