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
import { StatusHistory, TipoRegistro } from "../entities/StatusHistory.js";
import { User, UserRole } from "../entities/User.js";
import type {
  NewStatusHistory,
  StatusHistoryRepository,
} from "../repositories/statusHistoryRepository.js";
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

function createSolicitationRepository(
  solicitations: Solicitation[],
): SolicitationRepository {
  return {
    async list() {
      return { solicitations, totalItems: solicitations.length };
    },
    async listActiveMaintainers() {
      return [];
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
      return found;
    },
    async transaction(work) {
      return work({
        manager: {} as EntityManager,
        findByIdForUpdate: async (id) =>
          solicitations.find((candidate) => candidate.id === id) ?? null,
        findActiveMaintainerForUpdate: async () => null,
        save: async (solicitationToSave) => {
          const index = solicitations.findIndex(
            (candidate) => candidate.id === solicitationToSave.id,
          );
          if (index >= 0) {
            solicitations[index] = solicitationToSave;
          }
          return solicitationToSave;
        },
      });
    },
  };
}

function createStatusHistoryRepository(
  solicitations: Solicitation[],
): StatusHistoryRepository & { entries: NewStatusHistory[] } {
  const entries: NewStatusHistory[] = [];

  return {
    entries,
    async create(entry) {
      entries.push(entry);
      return Object.assign(new StatusHistory(), entry, {
        id: entries.length,
        dataHora: new Date("2026-11-07T13:00:00.000Z"),
        autor: loggedUser,
      });
    },
    async findSolicitationState(id) {
      const found = solicitations.find((candidate) => candidate.id === id);
      return found
        ? {
            solicitanteId: found.solicitanteId,
            responsavelId: found.responsavelId,
            status: found.status,
          }
        : null;
    },
    async listBySolicitation() {
      return [];
    },
  };
}

async function startServer(
  solicitationRepository: SolicitationRepository,
  statusHistoryRepository: StatusHistoryRepository,
): Promise<string> {
  server = createApp(
    async () => undefined,
    userRepository,
    sessionRepository,
    userManagementRepository,
    { secureCookies: false, webOrigin },
    undefined,
    statusHistoryRepository,
    solicitationRepository,
  ).listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

function postCancel(
  baseUrl: string,
  id: number,
  motivo: string,
  headers: Record<string, string> = {
    Cookie: `fixit_session=${sessionToken}`,
    Origin: webOrigin,
  },
): Promise<Response> {
  return fetch(`${baseUrl}/api/solicitations/${id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ motivo }),
  });
}

describe("POST /api/solicitations/:id/cancel", () => {
  it("lets a Gestor cancel an open request with a reason (CA1)", async () => {
    const requests = [solicitation(1)];
    const history = createStatusHistoryRepository(requests);
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      history,
    );

    const response = await postCancel(baseUrl, 1, "Chamado duplicado");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        solicitation: {
          id: 1,
          status: "CANCELADA",
          dataConclusao: null,
        },
      },
    });
    expect(requests[0]?.status).toBe(StatusSolicitacao.CANCELADA);
    expect(history.entries).toEqual([
      {
        solicitacaoId: 1,
        autorId: loggedUser.id,
        tipo: TipoRegistro.CANCELAMENTO,
        statusAnterior: StatusSolicitacao.EM_ABERTO,
        statusNovo: StatusSolicitacao.CANCELADA,
        descricao: "Chamado duplicado",
      },
    ]);
  });

  it("refuses a concluded request and does not change it (CA2)", async () => {
    const requests = [
      solicitation(1, { status: StatusSolicitacao.CONCLUIDO }),
    ];
    const history = createStatusHistoryRepository(requests);
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      history,
    );

    const response = await postCancel(baseUrl, 1, "Duplicado");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SOLICITATION_NOT_CANCELABLE" },
    });
    expect(requests[0]?.status).toBe(StatusSolicitacao.CONCLUIDO);
    expect(history.entries).toHaveLength(0);
  });

  it("refuses a request that is already in attendance", async () => {
    const requests = [
      solicitation(1, { status: StatusSolicitacao.EM_ATENDIMENTO }),
    ];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await postCancel(baseUrl, 1, "Duplicado");

    expect(response.status).toBe(409);
  });

  it.each([UserRole.MANUTENTOR, UserRole.CLIENTE])(
    "refuses a %s",
    async (role) => {
      loggedUser.role = role;
      const requests = [solicitation(1)];
      const history = createStatusHistoryRepository(requests);
      const baseUrl = await startServer(
        createSolicitationRepository(requests),
        history,
      );

      const response = await postCancel(baseUrl, 1, "Duplicado");

      expect(response.status).toBe(403);
      expect(history.entries).toHaveLength(0);
    },
  );

  it("rejects a blank reason", async () => {
    const baseUrl = await startServer(
      createSolicitationRepository([solicitation(1)]),
      createStatusHistoryRepository([solicitation(1)]),
    );

    const response = await postCancel(baseUrl, 1, "   ");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: { motivo: "Informe o motivo do cancelamento." },
      },
    });
  });

  it("rejects a reason longer than 500 characters", async () => {
    const baseUrl = await startServer(
      createSolicitationRepository([solicitation(1)]),
      createStatusHistoryRepository([solicitation(1)]),
    );

    const response = await postCancel(baseUrl, 1, "x".repeat(501));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: {
          motivo: "O motivo pode ter até 500 caracteres.",
        },
      },
    });
  });

  it("refuses a request without a session", async () => {
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await postCancel(baseUrl, 1, "Duplicado", {
      Origin: webOrigin,
    });

    expect(response.status).toBe(401);
  });

  it("refuses a request from another origin", async () => {
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await postCancel(baseUrl, 1, "Duplicado", {
      Cookie: `fixit_session=${sessionToken}`,
      Origin: "https://site-malicioso.example",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED" },
    });
  });

  it("answers 404 for a request that does not exist", async () => {
    const baseUrl = await startServer(
      createSolicitationRepository([]),
      createStatusHistoryRepository([]),
    );

    const response = await postCancel(baseUrl, 99, "Duplicado");

    expect(response.status).toBe(404);
  });
});
