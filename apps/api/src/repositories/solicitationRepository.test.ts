import { QueryFailedError, type EntityManager } from "typeorm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDataSource } from "../config/database.js";
import { Solicitation, StatusSolicitacao } from "../entities/Solicitation.js";
import { UserRole } from "../entities/User.js";
import {
  createSolicitationRepository,
  SOLICITATION_ASSET_FOREIGN_KEY,
  SolicitationAssetNotFoundError,
} from "./solicitationRepository.js";

// Usa metadados e QueryBuilder reais do driver PostgreSQL, sem abrir conexão.
// Comprova o SQL produzido; não executa o filtro contra linhas no banco.
const dataSource = createDataSource("postgresql://localhost/fixit_test");
const clients = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];

beforeAll(async () => {
  // Inicializa só os metadados. initialize() exigiria PostgreSQL disponível.
  await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
});
afterEach(() => vi.restoreAllMocks());

describe("US011 — real repository SQL (no PostgreSQL execution)", () => {
  it.each(clients)("restricts the list to authenticated Cliente %s", async (userId) => {
    const ormRepository = dataSource.getRepository(Solicitation);
    const query = ormRepository.createQueryBuilder("solicitation");
    vi.spyOn(ormRepository, "createQueryBuilder").mockReturnValue(query);
    const execute = vi.spyOn(query, "getManyAndCount").mockResolvedValue([[], 0]);

    await createSolicitationRepository(dataSource).list(
      { page: 1, pageSize: 20 }, { role: UserRole.CLIENTE, userId },
    );

    const [sql, parameters] = query.getQueryAndParameters();
    const where = sql.split(" WHERE ")[1]?.split(" ORDER BY ")[0];
    expect(where).toBe('"solicitation"."solicitante_id" = $1');
    expect(parameters).toEqual([userId]);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("keeps ownership as an AND restriction when filters and pagination are used", async () => {
    const ormRepository = dataSource.getRepository(Solicitation);
    const query = ormRepository.createQueryBuilder("solicitation");
    vi.spyOn(ormRepository, "createQueryBuilder").mockReturnValue(query);
    vi.spyOn(query, "getManyAndCount").mockResolvedValue([[], 0]);

    await createSolicitationRepository(dataSource).list(
      { page: 2, pageSize: 1, status: StatusSolicitacao.EM_ABERTO, setor: "TI" },
      { role: UserRole.CLIENTE, userId: clients[0] },
    );

    const [sql, parameters] = query.getQueryAndParameters();
    const where = sql.split(" WHERE ")[1]?.split(" ORDER BY ")[0];
    expect(where).toBe('"solicitation"."solicitante_id" = $1 AND "solicitation"."status" = $2 AND "solicitation"."setor_responsavel" ILIKE $3');
    expect(parameters).toEqual([clients[0], "EM_ABERTO", "%TI%"]);
    expect(query.expressionMap.skip).toBe(1);
    expect(query.expressionMap.take).toBe(1);
  });
});

describe("US008: asset foreign key on save (no PostgreSQL execution)", () => {
  function driverError(code: string, constraint?: string) {
    return Object.assign(new Error("driver error"), { code, constraint });
  }

  // Simula o PostgreSQL recusando o INSERT dentro da transação.
  async function saveFailingWith(error: unknown) {
    const save = vi.fn().mockRejectedValue(error);
    const manager = { getRepository: () => ({ save }) } as unknown as EntityManager;
    vi.spyOn(dataSource, "transaction").mockImplementation(
      (async (work: (manager: EntityManager) => Promise<unknown>) => work(manager)) as never,
    );
    return createSolicitationRepository(dataSource).transaction((transaction) =>
      transaction.save(Object.assign(new Solicitation(), { bemId: 99 })));
  }

  it("uses the name TypeORM gives to the bem_id foreign key", () => {
    const key = dataSource.getMetadata(Solicitation).foreignKeys
      .find((candidate) => candidate.columns[0].databaseName === "bem_id");
    expect(key?.name).toBe(SOLICITATION_ASSET_FOREIGN_KEY);
  });

  it("turns the bem_id foreign key violation into SolicitationAssetNotFoundError", async () => {
    const error = new QueryFailedError(
      "INSERT", [], driverError("23503", SOLICITATION_ASSET_FOREIGN_KEY),
    );
    await expect(saveFailingWith(error)).rejects.toBeInstanceOf(SolicitationAssetNotFoundError);
  });

  it.each([
    ["another foreign key", new QueryFailedError("INSERT", [], driverError("23503", "FK_other"))],
    ["a unique violation", new QueryFailedError("INSERT", [], driverError("23505", SOLICITATION_ASSET_FOREIGN_KEY))],
    ["a non-database error", new Error("connection lost")],
  ])("keeps %s unchanged", async (_label, error) => {
    await expect(saveFailingWith(error)).rejects.toBe(error);
  });
});
