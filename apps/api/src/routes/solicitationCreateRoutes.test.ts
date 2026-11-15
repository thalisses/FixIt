import { once } from "node:events";
import type { Server } from "node:http";
import type { EntityManager } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../entities/AuthSession.js";
import { Solicitation, StatusSolicitacao } from "../entities/Solicitation.js";
import { StatusHistory, TipoRegistro } from "../entities/StatusHistory.js";
import { User, UserRole } from "../entities/User.js";
import type { SolicitationRepository } from "../repositories/solicitationRepository.js";
import type { NewStatusHistory, StatusHistoryRepository } from "../repositories/statusHistoryRepository.js";
import type { SessionRepository } from "../services/sessionService.js";
import type { UserRepository } from "../services/userService.js";
import type { UserManagementRepository } from "../services/userManagementService.js";

const origin = "http://localhost:5173";
const cookie = `fixit_session=${"a".repeat(43)}`;
const validInput = {
  local: "Bloco C, sala 12",
  tipoProblema: "INFORMATICA",
  descricaoProblema: "Projetor não liga",
  urgencia: "ALTA",
};
let server: Server | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
});

async function setup(role = UserRole.CLIENTE) {
  const user = Object.assign(new User(), {
    id: "11111111-1111-4111-8111-111111111111",
    fullName: "Ana Silva",
    email: "ana@example.edu",
    role,
    isActive: true,
  });
  const solicitations: Solicitation[] = [];
  const history: NewStatusHistory[] = [];
  const manager = {} as EntityManager;
  let pendingHistory: NewStatusHistory[] = [];
  // Simulação de commit/rollback em memória: não comprova rollback PostgreSQL.
  const save = vi.fn(async (entry: Solicitation) => Object.assign(entry, {
    id: 1,
    data: new Date("2026-11-14T12:00:00.000Z"),
  }));
  const runTransaction: SolicitationRepository["transaction"] = async (work) => {
    const pendingSolicitations: Solicitation[] = [];
    pendingHistory = [];
    const result = await work({
      manager,
      findByIdForUpdate: async () => null,
      findActiveMaintainerForUpdate: async () => null,
      save: async (entry) => {
        const saved = await save(entry);
        pendingSolicitations.push(saved);
        return saved;
      },
    });
    solicitations.push(...pendingSolicitations);
    history.push(...pendingHistory);
    return result;
  };
  const repository: SolicitationRepository = {
    list: async (_filters, scope) => {
      const visible = solicitations.filter((entry) =>
        scope.role === UserRole.GESTOR ||
        (scope.role === UserRole.CLIENTE && entry.solicitanteId === scope.userId) ||
        (scope.role === UserRole.MANUTENTOR && entry.responsavelId === scope.userId));
      return { solicitations: visible, totalItems: visible.length };
    },
    listActiveMaintainers: async () => [],
    countTriage: async () => solicitations.length,
    findById: async (id) => solicitations.find((entry) => entry.id === id) ?? null,
    updatePriority: async () => null,
    transaction: runTransaction,
  };
  const transaction = vi.spyOn(repository, "transaction");
  const createHistory = vi.fn<StatusHistoryRepository["create"]>(async (entry, receivedManager) => {
    expect(receivedManager).toBe(manager);
    pendingHistory.push(entry);
    return Object.assign(new StatusHistory(), entry, { id: 1, dataHora: new Date() });
  });
  const historyRepository: StatusHistoryRepository = {
    create: createHistory,
    findSolicitationState: async () => null,
    listBySolicitation: async () => [],
  };
  const users: UserRepository = {
    create: (input) => Object.assign(new User(), input),
    findOneBy: async () => null,
    save: async (entry) => entry,
  };
  const sessions: SessionRepository = {
    create: (input) => Object.assign(new AuthSession(), input),
    save: async (entry) => entry,
    findOneByTokenHash: async () => Object.assign(new AuthSession(), {
      userId: user.id, expiresAt: null, revokedAt: null,
    }),
    findUserById: async (id) => id === user.id ? user : null,
  };
  const management: UserManagementRepository = {
    list: async () => ({ users: [], totalItems: 0 }),
    transaction: async () => { throw new Error("Not used"); },
  };
  server = createApp(async () => undefined, users, sessions, management,
    { secureCookies: false, webOrigin: origin }, undefined, historyRepository, repository)
    .listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing TCP port");
  const url = `http://127.0.0.1:${address.port}/api/solicitations`;
  function post(input: unknown = validInput, headers: Record<string, string> = { Cookie: cookie, Origin: origin }) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(input),
    });
  }
  return { user, solicitations, history, manager, save, transaction, createHistory, post, url };
}

describe("US007 — POST /api/solicitations", () => {
  it.each(Object.values(UserRole))("creates for %s with server defaults and ABERTURA (CA1)", async (role) => {
    const context = await setup(role);
    const response = await context.post();
    expect(response.status).toBe(201);
    expect((await response.json()).data.solicitation).toMatchObject({
      id: 1, ...validInput, status: "EM_ABERTO",
      solicitante: { id: context.user.id, fullName: context.user.fullName },
    });
    expect(context.solicitations).toHaveLength(1);
    expect(context.solicitations[0]).toMatchObject({
      ...validInput, solicitanteId: context.user.id,
      status: StatusSolicitacao.EM_ABERTO, prioridade: null,
      responsavelId: null, dataConclusao: null,
    });
    expect(context.history).toEqual([{
      solicitacaoId: 1, autorId: context.user.id, tipo: TipoRegistro.ABERTURA,
      statusAnterior: null, statusNovo: StatusSolicitacao.EM_ABERTO, descricao: null,
    }]);
    expect(context.createHistory).toHaveBeenCalledWith(context.history[0], context.manager);
  });

  it.each(["BAIXA", "MEDIA", "ALTA"])("preserves urgency %s", async (urgencia) => {
    const context = await setup();
    const response = await context.post({ ...validInput, urgencia });
    expect(response.status).toBe(201);
    expect((await response.json()).data.solicitation.urgencia).toBe(urgencia);
    expect(context.solicitations[0].urgencia).toBe(urgencia);
  });

  const fields = ["local", "tipoProblema", "descricaoProblema", "urgencia"] as const;
  for (const field of fields) {
    it.each([undefined, "", "   "])(`rejects ${field} = %s with a field error (CA2)`, async (value) => {
      const context = await setup();
      const response = await context.post({ ...validInput, [field]: value });
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.fields[field]).toEqual(expect.any(String));
      expect(context.transaction).not.toHaveBeenCalled();
      expect(context.history).toEqual([]);
    });
  }

  it.each(["tipoProblema", "urgencia"])("rejects invalid enum %s", async (field) => {
    const context = await setup();
    const response = await context.post({ ...validInput, [field]: "INVALIDO" });
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields[field]).toEqual(expect.any(String));
    expect(context.transaction).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    const context = await setup();
    const response = await context.post(validInput, { Origin: origin });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(context.transaction).not.toHaveBeenCalled();
  });

  it.each(["https://untrusted.example", undefined])("rejects Origin %s", async (value) => {
    const context = await setup();
    const headers: Record<string, string> = { Cookie: cookie };
    if (value) headers.Origin = value;
    const response = await context.post(validInput, headers);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(context.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["status", "CONCLUIDO"], ["solicitanteId", "another-user"],
    ["prioridade", "ALTA"], ["responsavelId", "another-user"],
    ["dataConclusao", "2026-11-14T12:00:00.000Z"], ["id", 42],
    ["data", "2026-11-14T12:00:00.000Z"],
  ])("rejects server-controlled field %s", async (field, value) => {
    const context = await setup();
    const response = await context.post({ ...validInput, [field]: value });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(context.transaction).not.toHaveBeenCalled();
  });

  it("shows the created request in the Gestor list (CA3)", async () => {
    const context = await setup();
    expect((await context.post()).status).toBe(201);
    context.user.role = UserRole.GESTOR;
    const response = await fetch(context.url, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([
      expect.objectContaining({ id: 1, status: "EM_ABERTO", urgencia: validInput.urgencia }),
    ]);
  });

  it("does not confirm creation if history fails (simulated transaction only)", async () => {
    const context = await setup();
    const failure = new Error("History unavailable");
    context.createHistory.mockRejectedValueOnce(failure);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await context.post();
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(context.save).toHaveBeenCalledOnce();
    expect(context.createHistory).toHaveBeenCalledWith(expect.any(Object), context.manager);
    await expect(context.transaction.mock.results[0].value).rejects.toBe(failure);
    expect(context.solicitations).toEqual([]);
    expect(context.history).toEqual([]);
  });

  it("does not record history if saving the request fails", async () => {
    const context = await setup();
    context.save.mockRejectedValueOnce(new Error("Insert failed"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await context.post()).status).toBe(500);
    expect(context.createHistory).not.toHaveBeenCalled();
    expect(context.solicitations).toEqual([]);
  });
});
