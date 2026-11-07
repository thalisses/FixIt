import { once } from "node:events";
import type { Server } from "node:http";
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
import type {
  SolicitationListFilters,
  SolicitationListScope,
  SolicitationRepository,
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
  passwordHash: "hash-que-nao-pode-vazar",
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

interface Calls {
  filters: SolicitationListFilters;
  scope: SolicitationListScope;
}

function createFakeRepository(
  solicitations: Solicitation[] = [solicitation(1)],
  totalItems = solicitations.length,
): SolicitationRepository & { calls: Calls[] } {
  const calls: Calls[] = [];

  return {
    calls,
    async list(filters, scope) {
      calls.push({ filters, scope });
      return { solicitations, totalItems };
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

function getList(
  baseUrl: string,
  query = "",
  headers: Record<string, string> = {
    Cookie: `fixit_session=${sessionToken}`,
  },
): Promise<Response> {
  return fetch(`${baseUrl}/api/solicitations${query}`, { headers });
}

describe("GET /api/solicitations access", () => {
  it("refuses a request without a session", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await getList(baseUrl, "", {});

    expect(response.status).toBe(401);
    expect(repository.calls).toHaveLength(0);
  });

  it.each([
    [UserRole.GESTOR, "GESTOR"],
    [UserRole.MANUTENTOR, "MANUTENTOR"],
    [UserRole.CLIENTE, "CLIENTE"],
  ])("applies the %s scope", async (role, expectedRole) => {
    loggedUser.role = role;
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await getList(baseUrl);

    expect(response.status).toBe(200);
    expect(repository.calls[0]?.scope).toEqual({
      role: expectedRole,
      userId: loggedUser.id,
    });
  });
});

describe("GET /api/solicitations", () => {
  it("lists the fields required by US013 CA1 without exposing credentials", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await getList(baseUrl);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: [
        {
          id: 1,
          local: "Bloco C, sala 12",
          tipoProblema: "INFORMATICA",
          setorResponsavel: "TI",
          urgencia: "ALTA",
          prioridade: "MEDIA",
          status: "EM_ABERTO",
          solicitante: { id: requester.id, fullName: "Bruno Souza" },
          responsavel: null,
          bem: {
            id: 7,
            codigoPatrimonial: "PAT-7",
            descricao: "Projetor Epson",
          },
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    });
    expect(JSON.stringify(body)).not.toContain("hash-que-nao-pode-vazar");
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("passes combined filters and pagination to the repository (CA2)", async () => {
    const repository = createFakeRepository([], 21);
    const baseUrl = await startServer(repository);
    const responsavelId = "33333333-3333-4333-8333-333333333333";

    const response = await getList(
      baseUrl,
      "?status=EM_ABERTO&setor=TI&tipo=INFORMATICA&prioridade=ALTA" +
        `&responsavelId=${responsavelId}` +
        "&de=2026-11-01&ate=2026-11-30&page=2&pageSize=10",
    );

    expect(response.status).toBe(200);
    expect(repository.calls[0]?.filters).toEqual({
      status: StatusSolicitacao.EM_ABERTO,
      setor: "TI",
      tipo: AreaTecnica.INFORMATICA,
      prioridade: NivelPrioridade.ALTA,
      responsavelId,
      de: "2026-11-01",
      ate: "2026-11-30",
      page: 2,
      pageSize: 10,
    });
    await expect(response.json()).resolves.toMatchObject({
      data: [],
      pagination: {
        page: 2,
        pageSize: 10,
        totalItems: 21,
        totalPages: 3,
      },
    });
  });

  it("supports the triage filter (US019)", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    await getList(baseUrl, "?semResponsavel=true");

    expect(repository.calls[0]?.filters.semResponsavel).toBe(true);
  });

  it("answers an empty list when no request matches (CA3)", async () => {
    const baseUrl = await startServer(createFakeRepository([], 0));

    const response = await getList(baseUrl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });
  });

  it("rejects an invalid status", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await getList(baseUrl, "?status=INVALIDO");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: { status: "Status inválido." },
      },
    });
  });

  it("rejects an invalid page size above the limit", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await getList(baseUrl, "?pageSize=101");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: {
          pageSize: "O tamanho da página deve estar entre 1 e 100.",
        },
      },
    });
  });

  it("rejects a date range with the end before the start", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await getList(baseUrl, "?de=2026-11-30&ate=2026-11-01");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: {
          de: "A data inicial não pode ser posterior à final.",
        },
      },
    });
  });

  it("rejects a repeated query parameter", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await getList(
      baseUrl,
      "?status=EM_ABERTO&status=CONCLUIDO",
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects contradictory responsibility filters", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await getList(
      baseUrl,
      "?semResponsavel=true&responsavelId=33333333-3333-4333-8333-333333333333",
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: {
          semResponsavel:
            "Não combine 'sem responsável' com um responsável específico.",
        },
      },
    });
  });
});
