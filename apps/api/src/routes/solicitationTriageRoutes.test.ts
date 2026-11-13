import { once } from "node:events";
import type { Server } from "node:http";
import type { EntityManager } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User, UserRole } from "../entities/User.js";
import type {
  SolicitationRepository,
  SolicitationTransaction,
} from "../repositories/solicitationRepository.js";
import type { SessionRepository } from "../services/sessionService.js";
import type { UserManagementRepository } from "../services/userManagementService.js";
import type { UserRepository } from "../services/userService.js";

let server: Server | undefined;

const webOrigin = "http://localhost:5173";
const sessionToken = "a".repeat(43);
const loggedUser = Object.assign(new User(), {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ana Silva",
  email: "ana@example.edu",
  isActive: true,
  role: UserRole.GESTOR,
});

const userRepository: UserRepository = {
  create: (input) => Object.assign(new User(), input),
  findOneBy: async () => null,
  save: async (user) => user,
};
const sessionRepository: SessionRepository = {
  create: (input) => Object.assign(new AuthSession(), input),
  save: async (session) => session,
  findOneByTokenHash: async () =>
    Object.assign(new AuthSession(), {
      userId: loggedUser.id,
      expiresAt: null,
      revokedAt: null,
    }),
  findUserById: async (userId) => (userId === loggedUser.id ? loggedUser : null),
};
const userManagementRepository: UserManagementRepository = {
  list: async () => ({ users: [], totalItems: 0 }),
  transaction: async <T>() => {
    throw new Error("User management is not used in this test.");
  },
};

beforeEach(() => {
  loggedUser.role = UserRole.GESTOR;
});

afterEach(async () => {
  const currentServer = server;
  server = undefined;
  vi.restoreAllMocks();

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

function createFakeRepository(count: number): SolicitationRepository {
  return {
    async list() {
      return { solicitations: [], totalItems: 0 };
    },
    async listActiveMaintainers() {
      return [];
    },
    async countTriage() {
      return count;
    },
    async findById() {
      return null;
    },
    async updatePriority() {
      return null;
    },
    async transaction<T>(work: (transaction: SolicitationTransaction) => Promise<T>) {
      return work({
        manager: {} as EntityManager,
        findByIdForUpdate: async () => null,
        findActiveMaintainerForUpdate: async () => null,
        save: async (solicitation) => solicitation,
      });
    },
  };
}

async function startServer(repository: SolicitationRepository): Promise<string> {
  server = createApp(
    async () => undefined,
    userRepository,
    sessionRepository,
    userManagementRepository,
    { secureCookies: false, webOrigin },
    undefined,
    undefined,
    repository,
  ).listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

function getTriage(
  baseUrl: string,
  headers: Record<string, string> = {
    Cookie: `fixit_session=${sessionToken}`,
  },
): Promise<Response> {
  return fetch(`${baseUrl}/api/solicitations/triage-count`, { headers });
}

describe("GET /api/solicitations/triage-count", () => {
  it("returns the open and unassigned count for a Gestor (CA1)", async () => {
    const baseUrl = await startServer(createFakeRepository(3));

    const response = await getTriage(baseUrl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { count: 3 } });
  });

  it("returns zero when there are no requests waiting for triage (CA3)", async () => {
    const baseUrl = await startServer(createFakeRepository(0));

    const response = await getTriage(baseUrl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { count: 0 } });
  });

  it.each([UserRole.MANUTENTOR, UserRole.CLIENTE])(
    "refuses a %s",
    async (role) => {
      loggedUser.role = role;
      const baseUrl = await startServer(createFakeRepository(3));

      const response = await getTriage(baseUrl);

      expect(response.status).toBe(403);
    },
  );

  it("refuses a request without a session", async () => {
    const baseUrl = await startServer(createFakeRepository(3));

    const response = await getTriage(baseUrl, {});

    expect(response.status).toBe(401);
  });
});
