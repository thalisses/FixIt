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
const maintainer = Object.assign(new User(), {
  id: "33333333-3333-4333-8333-333333333333",
  fullName: "Carla Lima",
  email: "carla@example.edu",
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
  loggedUser.id = "11111111-1111-4111-8111-111111111111";
  loggedUser.fullName = "Ana Silva";
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
    observacoes: "Equipamento usado em aula",
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

const authenticatedHeaders = {
  Cookie: `fixit_session=${sessionToken}`,
  Origin: webOrigin,
};

function getDetail(
  baseUrl: string,
  id: number,
  headers: Record<string, string> = {
    Cookie: `fixit_session=${sessionToken}`,
  },
): Promise<Response> {
  return fetch(`${baseUrl}/api/solicitations/${id}`, { headers });
}

function patchStatus(
  baseUrl: string,
  id: number,
  status: string,
  headers: Record<string, string> = authenticatedHeaders,
): Promise<Response> {
  return fetch(`${baseUrl}/api/solicitations/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ status }),
  });
}

describe("GET /api/solicitations/:id", () => {
  it("lets a Gestor see the full details", async () => {
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await getDetail(baseUrl, 1);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        solicitation: {
          id: 1,
          descricaoProblema: "Projetor não liga",
          observacoes: "Equipamento usado em aula",
          solicitante: { id: requester.id, fullName: "Bruno Souza" },
          bem: { id: asset.id, codigoPatrimonial: "PAT-7" },
        },
      },
    });
  });

  it("lets a Cliente see only their own request", async () => {
    loggedUser.id = requester.id;
    loggedUser.role = UserRole.CLIENTE;
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await getDetail(baseUrl, 1);

    expect(response.status).toBe(200);
  });

  it("refuses a Cliente reading another person's request", async () => {
    loggedUser.id = "44444444-4444-4444-8444-444444444444";
    loggedUser.role = UserRole.CLIENTE;
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await getDetail(baseUrl, 1);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("lets the assigned Manutentor read the request", async () => {
    loggedUser.id = maintainer.id;
    loggedUser.role = UserRole.MANUTENTOR;
    const requests = [
      solicitation(1, {
        responsavelId: maintainer.id,
        responsavel: maintainer,
      }),
    ];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await getDetail(baseUrl, 1);

    expect(response.status).toBe(200);
  });

  it("refuses a Manutentor who is not assigned", async () => {
    loggedUser.id = maintainer.id;
    loggedUser.role = UserRole.MANUTENTOR;
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await getDetail(baseUrl, 1);

    expect(response.status).toBe(403);
  });

  it("answers 404 for a request that does not exist", async () => {
    const baseUrl = await startServer(
      createSolicitationRepository([]),
      createStatusHistoryRepository([]),
    );

    const response = await getDetail(baseUrl, 99);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SOLICITATION_NOT_FOUND" },
    });
  });

  it("refuses a request without a session", async () => {
    const baseUrl = await startServer(
      createSolicitationRepository([solicitation(1)]),
      createStatusHistoryRepository([solicitation(1)]),
    );

    const response = await getDetail(baseUrl, 1, {});

    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/solicitations/:id/status", () => {
  it("lets a Gestor start the attendance and records the author/date (CA1)", async () => {
    const requests = [solicitation(1)];
    const history = createStatusHistoryRepository(requests);
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      history,
    );

    const response = await patchStatus(baseUrl, 1, "EM_ATENDIMENTO");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { solicitation: { status: "EM_ATENDIMENTO", dataConclusao: null } },
    });
    expect(history.entries).toEqual([
      {
        solicitacaoId: 1,
        autorId: loggedUser.id,
        tipo: TipoRegistro.MUDANCA_STATUS,
        statusAnterior: StatusSolicitacao.EM_ABERTO,
        statusNovo: StatusSolicitacao.EM_ATENDIMENTO,
        descricao: null,
      },
    ]);
  });

  it("lets the assigned Manutentor change the status", async () => {
    loggedUser.id = maintainer.id;
    loggedUser.role = UserRole.MANUTENTOR;
    const requests = [
      solicitation(1, {
        responsavelId: maintainer.id,
        responsavel: maintainer,
      }),
    ];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await patchStatus(baseUrl, 1, "EM_ATENDIMENTO");

    expect(response.status).toBe(200);
  });

  it("refuses a Cliente and does not record history (CA3)", async () => {
    loggedUser.id = requester.id;
    loggedUser.role = UserRole.CLIENTE;
    const requests = [solicitation(1)];
    const history = createStatusHistoryRepository(requests);
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      history,
    );

    const response = await patchStatus(baseUrl, 1, "EM_ATENDIMENTO");

    expect(response.status).toBe(403);
    expect(history.entries).toHaveLength(0);
    expect(requests[0]?.status).toBe(StatusSolicitacao.EM_ABERTO);
  });

  it("refuses a Manutentor who is not assigned", async () => {
    loggedUser.id = maintainer.id;
    loggedUser.role = UserRole.MANUTENTOR;
    const requests = [solicitation(1)];
    const history = createStatusHistoryRepository(requests);
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      history,
    );

    const response = await patchStatus(baseUrl, 1, "EM_ATENDIMENTO");

    expect(response.status).toBe(403);
    expect(history.entries).toHaveLength(0);
  });

  it("records the conclusion date when the status becomes CONCLUIDO (CA2)", async () => {
    const requests = [
      solicitation(1, { status: StatusSolicitacao.EM_ATENDIMENTO }),
    ];
    const history = createStatusHistoryRepository(requests);
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      history,
    );

    const response = await patchStatus(baseUrl, 1, "CONCLUIDO");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.solicitation.dataConclusao).toEqual(expect.any(String));
    expect(history.entries[0]).toMatchObject({
      statusAnterior: StatusSolicitacao.EM_ATENDIMENTO,
      statusNovo: StatusSolicitacao.CONCLUIDO,
    });
  });

  it("refuses an invalid transition", async () => {
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await patchStatus(baseUrl, 1, "CONCLUIDO");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_STATUS_TRANSITION" },
    });
  });

  it("refuses the same status", async () => {
    const requests = [
      solicitation(1, { status: StatusSolicitacao.EM_ATENDIMENTO }),
    ];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await patchStatus(baseUrl, 1, "EM_ATENDIMENTO");

    expect(response.status).toBe(409);
  });

  it("refuses an invalid status body", async () => {
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await patchStatus(baseUrl, 1, "INVALIDO");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", fields: { status: "Status inválido." } },
    });
  });

  it("refuses a request from another origin", async () => {
    const requests = [solicitation(1)];
    const baseUrl = await startServer(
      createSolicitationRepository(requests),
      createStatusHistoryRepository(requests),
    );

    const response = await patchStatus(baseUrl, 1, "EM_ATENDIMENTO", {
      Cookie: authenticatedHeaders.Cookie,
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

    const response = await patchStatus(baseUrl, 99, "EM_ATENDIMENTO");

    expect(response.status).toBe(404);
  });
});
