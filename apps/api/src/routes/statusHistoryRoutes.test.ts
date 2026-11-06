import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../entities/AuthSession.js";
import { StatusSolicitacao } from "../entities/Solicitation.js";
import { StatusHistory, TipoRegistro } from "../entities/StatusHistory.js";
import { User, UserRole } from "../entities/User.js";
import type {
  NewStatusHistory,
  SolicitationState,
  StatusHistoryRepository,
} from "../repositories/statusHistoryRepository.js";
import type { SessionRepository } from "../services/sessionService.js";
import type { UserManagementRepository } from "../services/userManagementService.js";
import type { UserRepository } from "../services/userService.js";

let server: Server | undefined;

const webOrigin = "http://localhost:5173";
const sessionToken = "a".repeat(43);
const loggedUser = Object.assign(new User(), {
  id: "user-1",
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

const manutentor = Object.assign(new User(), {
  id: "user-2",
  fullName: "Bruno Lima",
  email: "bruno@example.edu",
});

function entry(id: number, changes: Partial<StatusHistory>): StatusHistory {
  return Object.assign(new StatusHistory(), {
    id,
    solicitacaoId: 7,
    autorId: manutentor.id,
    autor: manutentor,
    statusAnterior: null,
    statusNovo: null,
    descricao: null,
    dataHora: new Date(`2026-11-0${id}T12:00:00.000Z`),
    ...changes,
  });
}

const opening = entry(1, {
  tipo: TipoRegistro.ABERTURA,
  statusNovo: StatusSolicitacao.EM_ABERTO,
});
const timeline = [
  opening,
  entry(2, {
    tipo: TipoRegistro.MUDANCA_STATUS,
    statusAnterior: StatusSolicitacao.EM_ABERTO,
    statusNovo: StatusSolicitacao.EM_ATENDIMENTO,
  }),
  entry(3, { tipo: TipoRegistro.OBSERVACAO, descricao: "Troquei o disjuntor" }),
];

function createFakeRepository(
  histories: Record<number, StatusHistory[]>,
  states: Record<number, SolicitationState> = {},
): StatusHistoryRepository & { listed: number[]; saved: NewStatusHistory[] } {
  const listed: number[] = [];
  const saved: NewStatusHistory[] = [];
  return {
    listed,
    saved,
    async create(entry) {
      saved.push(entry);
      const created = Object.assign(new StatusHistory(), entry, {
        id: 100 + saved.length,
        dataHora: new Date("2026-11-06T15:00:00.000Z"),
        autor: Object.assign(new User(), {
          id: entry.autorId,
          fullName: "Ana Silva",
        }),
      });
      (histories[entry.solicitacaoId] ??= []).push(created);
      return created;
    },
    async solicitationExists(id) {
      return id in histories;
    },
    async findSolicitationState(id) {
      return states[id] ?? null;
    },
    async listBySolicitation(id) {
      listed.push(id);
      return histories[id] ?? [];
    },
  };
}

async function startServer(repository: StatusHistoryRepository): Promise<string> {
  server = createApp(
    async () => undefined,
    userRepository,
    sessionRepository,
    userManagementRepository,
    { secureCookies: false, webOrigin },
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

function getHistory(
  baseUrl: string,
  id: string | number,
  headers: Record<string, string> = {
    Cookie: `fixit_session=${sessionToken}`,
  },
): Promise<Response> {
  return fetch(`${baseUrl}/api/solicitations/${id}/history`, { headers });
}

describe("GET /api/solicitations/:id/history access", () => {
  it.each([UserRole.GESTOR, UserRole.MANUTENTOR])(
    "lets a %s see the history",
    async (role) => {
      loggedUser.role = role;
      const baseUrl = await startServer(createFakeRepository({ 7: timeline }));

      const response = await getHistory(baseUrl, 7);

      expect(response.status).toBe(200);
    },
  );

  it("refuses a Cliente without reading the history", async () => {
    loggedUser.role = UserRole.CLIENTE;
    const repository = createFakeRepository({ 7: timeline });
    const baseUrl = await startServer(repository);

    const response = await getHistory(baseUrl, 7);

    expect(response.status).toBe(403);
    expect(repository.listed).toHaveLength(0);
  });

  it("refuses a request without a session", async () => {
    const repository = createFakeRepository({ 7: timeline });
    const baseUrl = await startServer(repository);

    const response = await getHistory(baseUrl, 7, {});

    expect(response.status).toBe(401);
    expect(repository.listed).toHaveLength(0);
  });
});

describe("GET /api/solicitations/:id/history", () => {
  it("shows each record with both statuses, the date and the author (CA1)", async () => {
    const baseUrl = await startServer(createFakeRepository({ 7: timeline }));

    const response = await getHistory(baseUrl, 7);

    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 1,
          tipo: "ABERTURA",
          statusAnterior: null,
          statusNovo: "EM_ABERTO",
          descricao: null,
          dataHora: "2026-11-01T12:00:00.000Z",
          autor: { id: "user-2", fullName: "Bruno Lima" },
        },
        {
          id: 2,
          tipo: "MUDANCA_STATUS",
          statusAnterior: "EM_ABERTO",
          statusNovo: "EM_ATENDIMENTO",
          descricao: null,
          dataHora: "2026-11-02T12:00:00.000Z",
          autor: { id: "user-2", fullName: "Bruno Lima" },
        },
        {
          id: 3,
          tipo: "OBSERVACAO",
          statusAnterior: null,
          statusNovo: null,
          descricao: "Troquei o disjuntor",
          dataHora: "2026-11-03T12:00:00.000Z",
          autor: { id: "user-2", fullName: "Bruno Lima" },
        },
      ],
    });
  });

  it("shows only the opening as Em Aberto for a new solicitation (CA2)", async () => {
    const baseUrl = await startServer(createFakeRepository({ 7: [opening] }));

    const body = await (await getHistory(baseUrl, 7)).json();

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      tipo: "ABERTURA",
      statusNovo: "EM_ABERTO",
    });
  });

  it("does not expose the author's email", async () => {
    const baseUrl = await startServer(createFakeRepository({ 7: timeline }));

    const text = await (await getHistory(baseUrl, 7)).text();

    expect(text).not.toContain("bruno@example.edu");
  });

  it("answers an empty list for a solicitation without records", async () => {
    const baseUrl = await startServer(createFakeRepository({ 7: [] }));

    const response = await getHistory(baseUrl, 7);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
  });

  it("answers 404 for a solicitation that does not exist", async () => {
    const repository = createFakeRepository({ 7: timeline });
    const baseUrl = await startServer(repository);

    const response = await getHistory(baseUrl, 8);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SOLICITATION_NOT_FOUND",
        message: "Solicitação não encontrada.",
      },
    });
    expect(repository.listed).toHaveLength(0);
  });

  it.each(["abc", "0", "-1", "1.5", "2147483648"])(
    "refuses the invalid id %s",
    async (id) => {
      const repository = createFakeRepository({ 7: timeline });
      const baseUrl = await startServer(repository);

      const response = await getHistory(baseUrl, id);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Identificador inválido.",
          fields: { id: "Identificador inválido." },
        },
      });
      expect(repository.listed).toHaveLength(0);
    },
  );

  it("does not expose internal details on an unexpected failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const baseUrl = await startServer({
      ...createFakeRepository({ 7: timeline }),
      listBySolicitation: async () => {
        throw new Error("connection to 10.0.0.5 refused");
      },
    });

    const response = await getHistory(baseUrl, 7);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Ocorreu um erro interno.",
      },
    });
  });
});

describe("POST /api/solicitations/:id/observations", () => {
  const authenticated = {
    "Content-Type": "application/json",
    Cookie: `fixit_session=${sessionToken}`,
    Origin: webOrigin,
  };

  function inService(responsavelId: string | null) {
    return { 7: { responsavelId, status: StatusSolicitacao.EM_ATENDIMENTO } };
  }

  function postObservation(
    baseUrl: string,
    id: string | number,
    body: unknown,
    headers: Record<string, string> = authenticated,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/solicitations/${id}/observations`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  it("records the observation with the author's name and the date (CA1)", async () => {
    loggedUser.role = UserRole.MANUTENTOR;
    const baseUrl = await startServer(
      createFakeRepository({ 7: [opening] }, inService("user-1")),
    );

    const response = await postObservation(baseUrl, 7, {
      descricao: "  Troquei o disjuntor  ",
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: {
        observation: {
          id: 101,
          tipo: "OBSERVACAO",
          statusAnterior: null,
          statusNovo: null,
          descricao: "Troquei o disjuntor",
          dataHora: "2026-11-06T15:00:00.000Z",
          autor: { id: "user-1", fullName: "Ana Silva" },
        },
      },
    });
  });

  it("keeps the earlier observations when a new one arrives (CA2)", async () => {
    loggedUser.role = UserRole.MANUTENTOR;
    const baseUrl = await startServer(
      createFakeRepository({ 7: [opening] }, inService("user-1")),
    );

    await postObservation(baseUrl, 7, { descricao: "Primeira visita" });
    await postObservation(baseUrl, 7, { descricao: "Peça trocada" });
    const history = await (await getHistory(baseUrl, 7)).json();

    expect(
      history.data.map(({ tipo, descricao }: { tipo: string; descricao: string }) => [
        tipo,
        descricao,
      ]),
    ).toEqual([
      ["ABERTURA", null],
      ["OBSERVACAO", "Primeira visita"],
      ["OBSERVACAO", "Peça trocada"],
    ]);
  });

  it.each([
    ["a Gestor who is not in charge", "user-2"],
    ["anyone while nobody is in charge", null],
  ])("refuses %s and saves nothing", async (_case, responsavelId) => {
    const repository = createFakeRepository({ 7: [opening] }, inService(responsavelId));
    const baseUrl = await startServer(repository);

    const response = await postObservation(baseUrl, 7, { descricao: "Ok" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_RESPONSIBLE",
        message: "Só o responsável pela solicitação pode registrar observações.",
      },
    });
    expect(repository.saved).toHaveLength(0);
  });

  it("refuses a closed solicitation", async () => {
    const repository = createFakeRepository(
      { 7: [opening] },
      { 7: { responsavelId: "user-1", status: StatusSolicitacao.CONCLUIDO } },
    );
    const baseUrl = await startServer(repository);

    const response = await postObservation(baseUrl, 7, { descricao: "Ok" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SOLICITATION_CLOSED",
        message: "A solicitação já foi encerrada.",
      },
    });
    expect(repository.saved).toHaveLength(0);
  });

  it("answers 404 for a solicitation that does not exist", async () => {
    const baseUrl = await startServer(createFakeRepository({}));

    const response = await postObservation(baseUrl, 8, { descricao: "Ok" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SOLICITATION_NOT_FOUND" },
    });
  });

  it.each([
    ["a blank text", { descricao: "   " }, "Escreva a observação."],
    ["a missing text", {}, "Escreva a observação."],
    [
      "a text over 2,000 characters",
      { descricao: "a".repeat(2001) },
      "A observação pode ter até 2.000 caracteres.",
    ],
  ])("refuses %s and saves nothing", async (_case, body, message) => {
    const repository = createFakeRepository({ 7: [opening] }, inService("user-1"));
    const baseUrl = await startServer(repository);

    const response = await postObservation(baseUrl, 7, body);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message,
        fields: { descricao: message },
      },
    });
    expect(repository.saved).toHaveLength(0);
  });

  it("accepts exactly 2,000 characters", async () => {
    const baseUrl = await startServer(
      createFakeRepository({ 7: [opening] }, inService("user-1")),
    );

    const response = await postObservation(baseUrl, 7, {
      descricao: "a".repeat(2000),
    });

    expect(response.status).toBe(201);
  });

  it("refuses an invalid id", async () => {
    const baseUrl = await startServer(createFakeRepository({}));

    const response = await postObservation(baseUrl, "abc", { descricao: "Ok" });

    expect(response.status).toBe(422);
  });

  it("refuses a request without a session and saves nothing", async () => {
    const repository = createFakeRepository({ 7: [opening] }, inService("user-1"));
    const baseUrl = await startServer(repository);

    const response = await postObservation(
      baseUrl,
      7,
      { descricao: "Ok" },
      { "Content-Type": "application/json", Origin: webOrigin },
    );

    expect(response.status).toBe(401);
    expect(repository.saved).toHaveLength(0);
  });

  it("refuses a request from another origin and saves nothing", async () => {
    const repository = createFakeRepository({ 7: [opening] }, inService("user-1"));
    const baseUrl = await startServer(repository);

    const response = await postObservation(
      baseUrl,
      7,
      { descricao: "Ok" },
      { ...authenticated, Origin: "http://evil.example" },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED" },
    });
    expect(repository.saved).toHaveLength(0);
  });
});
