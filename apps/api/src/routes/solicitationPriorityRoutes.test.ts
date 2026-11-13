import { once } from "node:events";
import type { Server } from "node:http";
import type { EntityManager } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { Asset, EstadoConservacao } from "../entities/Asset.js";
import { AuthSession } from "../entities/AuthSession.js";
import {
  AreaTecnica,
  NivelPrioridade,
  NivelUrgencia,
  Solicitation,
  StatusSolicitacao,
} from "../entities/Solicitation.js";
import { User, UserRole } from "../entities/User.js";
import type { SolicitationRepository } from "../repositories/solicitationRepository.js";
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
const requester = Object.assign(new User(), {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Bruno Souza",
  email: "bruno@example.edu",
});
const asset = Object.assign(new Asset(), {
  id: 7,
  codigoPatrimonial: "PAT-7",
  descricao: "Projetor Epson",
  localizacao: "Bloco C",
  estadoConservacao: EstadoConservacao.BOM,
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

function solicitation(
  id: number,
  changes: Partial<Solicitation> = {},
): Solicitation {
  return Object.assign(new Solicitation(), {
    id,
    data: new Date("2026-11-07T12:00:00.000Z"),
    local: "Bloco C, sala 12",
    tipoProblema: AreaTecnica.INFORMATICA,
    setorResponsavel: "TI",
    descricaoProblema: "Projetor não liga",
    observacoes: null,
    urgencia: NivelUrgencia.ALTA,
    prioridade: NivelPrioridade.MEDIA,
    status: StatusSolicitacao.EM_ABERTO,
    dataConclusao: null,
    solicitanteId: requester.id,
    solicitante: requester,
    responsavelId: null,
    responsavel: null,
    bemId: asset.id,
    bem: asset,
    ...changes,
  });
}

function createFakeRepository(
  solicitations: Solicitation[],
): SolicitationRepository & { updated: Array<[number, NivelPrioridade]> } {
  const updated: Array<[number, NivelPrioridade]> = [];

  return {
    updated,
    async list() {
      return { solicitations, totalItems: solicitations.length };
    },
    async listActiveMaintainers() {
      return [];
    },
    async countTriage() {
      return solicitations.filter(
        (candidate) =>
          candidate.status === StatusSolicitacao.EM_ABERTO &&
          candidate.responsavelId === null,
      ).length;
    },
    async findById(id) {
      return solicitations.find((candidate) => candidate.id === id) ?? null;
    },
    async updatePriority(id, prioridade) {
      const found = solicitations.find((candidate) => candidate.id === id);
      if (!found) {
        return null;
      }
      found.prioridade = prioridade;
      updated.push([id, prioridade]);
      return found;
    },
    async transaction(work) {
      return work({
        manager: {} as EntityManager,
        findByIdForUpdate: async (id) =>
          solicitations.find((candidate) => candidate.id === id) ?? null,
        findActiveMaintainerForUpdate: async () => null,
        save: async (solicitationToSave) => solicitationToSave,
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

function patchPriority(
  baseUrl: string,
  id: number,
  prioridade: string,
  headers: Record<string, string> = {
    Cookie: `fixit_session=${sessionToken}`,
    Origin: webOrigin,
  },
): Promise<Response> {
  return fetch(`${baseUrl}/api/solicitations/${id}/priority`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ prioridade }),
  });
}

describe("PATCH /api/solicitations/:id/priority access", () => {
  it("lets a Gestor change the priority (CA1)", async () => {
    const repository = createFakeRepository([solicitation(1)]);
    const baseUrl = await startServer(repository);

    const response = await patchPriority(baseUrl, 1, "ALTA");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { solicitation: { id: 1, prioridade: "ALTA" } },
    });
    expect(repository.updated).toEqual([[1, NivelPrioridade.ALTA]]);
  });

  it.each([UserRole.MANUTENTOR, UserRole.CLIENTE])(
    "refuses a %s",
    async (role) => {
      loggedUser.role = role;
      const repository = createFakeRepository([solicitation(1)]);
      const baseUrl = await startServer(repository);

      const response = await patchPriority(baseUrl, 1, "ALTA");

      expect(response.status).toBe(403);
      expect(repository.updated).toHaveLength(0);
    },
  );

  it("refuses a request without a session", async () => {
    const repository = createFakeRepository([solicitation(1)]);
    const baseUrl = await startServer(repository);

    const response = await patchPriority(baseUrl, 1, "ALTA", {
      Origin: webOrigin,
    });

    expect(response.status).toBe(401);
    expect(repository.updated).toHaveLength(0);
  });

  it("refuses a request from another origin", async () => {
    const repository = createFakeRepository([solicitation(1)]);
    const baseUrl = await startServer(repository);

    const response = await patchPriority(baseUrl, 1, "ALTA", {
      Cookie: `fixit_session=${sessionToken}`,
      Origin: "https://site-malicioso.example",
    });

    expect(response.status).toBe(403);
    expect(repository.updated).toHaveLength(0);
  });
});

describe("PATCH /api/solicitations/:id/priority", () => {
  it("keeps urgency and priority as separate fields (CA2)", async () => {
    const repository = createFakeRepository([
      solicitation(1, { urgencia: NivelUrgencia.BAIXA }),
    ]);
    const baseUrl = await startServer(repository);

    const response = await patchPriority(baseUrl, 1, "ALTA");

    await expect(response.json()).resolves.toMatchObject({
      data: {
        solicitation: { urgencia: "BAIXA", prioridade: "ALTA" },
      },
    });
  });

  it("accepts the same priority", async () => {
    const repository = createFakeRepository([solicitation(1)]);
    const baseUrl = await startServer(repository);

    const response = await patchPriority(baseUrl, 1, "MEDIA");

    expect(response.status).toBe(200);
  });

  it("rejects an invalid priority", async () => {
    const baseUrl = await startServer(
      createFakeRepository([solicitation(1)]),
    );

    const response = await patchPriority(baseUrl, 1, "URGENTE");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: { prioridade: "Prioridade inválida." },
      },
    });
  });

  it("answers 404 for a request that does not exist", async () => {
    const baseUrl = await startServer(createFakeRepository([]));

    const response = await patchPriority(baseUrl, 99, "ALTA");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SOLICITATION_NOT_FOUND" },
    });
  });
});
