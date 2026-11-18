import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User, UserRole } from "../entities/User.js";
import type {
  MaintenanceReport,
  MaintenanceReportFilters,
  ReportRepository,
} from "../repositories/reportRepository.js";
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

const sampleReport: MaintenanceReport = {
  total: 5,
  byStatus: {
    EM_ABERTO: 2,
    EM_ATENDIMENTO: 1,
    CONCLUIDO: 1,
    CANCELADA: 1,
  },
  averageResolutionHours: 36,
  topAssets: [
    {
      asset: { id: 1, codigoPatrimonial: "PAT-1", descricao: "Projetor" },
      count: 4,
    },
  ],
  hasData: true,
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

function createFakeRepository(
  report: MaintenanceReport = sampleReport,
): ReportRepository & { calls: Array<MaintenanceReportFilters | undefined> } {
  const calls: Array<MaintenanceReportFilters | undefined> = [];
  return {
    calls,
    async getMaintenanceReport(filters) {
      calls.push(filters);
      return report;
    },
  };
}

async function startServer(repository: ReportRepository): Promise<string> {
  server = createApp(
    async () => undefined,
    userRepository,
    sessionRepository,
    userManagementRepository,
    { secureCookies: false, webOrigin },
    undefined,
    undefined,
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

function getReport(
  baseUrl: string,
  headers: Record<string, string> = {
    Cookie: `fixit_session=${sessionToken}`,
  },
): Promise<Response> {
  return fetch(`${baseUrl}/api/reports/maintenance`, { headers });
}

describe("GET /api/reports/maintenance", () => {
  it("returns the Gestor indicators (CA1)", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await getReport(baseUrl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: sampleReport });
    expect(repository.calls).toEqual([{}]);
  });

  it("returns the empty state when there are no requests (CA3)", async () => {
    const baseUrl = await startServer(
      createFakeRepository({
        total: 0,
        byStatus: {
          EM_ABERTO: 0,
          EM_ATENDIMENTO: 0,
          CONCLUIDO: 0,
          CANCELADA: 0,
        },
        averageResolutionHours: null,
        topAssets: [],
        hasData: false,
      }),
    );

    const response = await getReport(baseUrl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { total: 0, hasData: false, averageResolutionHours: null },
    });
  });

  it.each([UserRole.MANUTENTOR, UserRole.CLIENTE])(
    "refuses a %s (CA2)",
    async (role) => {
      loggedUser.role = role;
      const baseUrl = await startServer(createFakeRepository());

      const response = await getReport(baseUrl);

      expect(response.status).toBe(403);
    },
  );

  it("passes the filters to the repository (CA1)", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await fetch(
      `${baseUrl}/api/reports/maintenance?de=2026-11-01&ate=2026-11-30` +
        "&setor=TI&tipo=INFORMATICA&status=CONCLUIDO",
      { headers: { Cookie: `fixit_session=${sessionToken}` } },
    );

    expect(response.status).toBe(200);
    expect(repository.calls[0]).toEqual({
      de: "2026-11-01",
      ate: "2026-11-30",
      setor: "TI",
      tipo: "INFORMATICA",
      status: "CONCLUIDO",
    });
  });

  it("rejects a period with the end before the start (CA2)", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await fetch(
      `${baseUrl}/api/reports/maintenance?de=2026-11-30&ate=2026-11-01`,
      { headers: { Cookie: `fixit_session=${sessionToken}` } },
    );

    expect(response.status).toBe(422);
    expect(repository.calls).toHaveLength(0);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: {
          de: "A data inicial não pode ser posterior à final.",
        },
      },
    });
  });

  it("rejects an invalid status", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await fetch(
      `${baseUrl}/api/reports/maintenance?status=INVALIDO`,
      { headers: { Cookie: `fixit_session=${sessionToken}` } },
    );

    expect(response.status).toBe(422);
    expect(repository.calls).toHaveLength(0);
  });

  it("refuses a request without a session", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await getReport(baseUrl, {});

    expect(response.status).toBe(401);
  });
});
