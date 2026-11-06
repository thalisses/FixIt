import type { EntityManager } from "typeorm";
import { describe, expect, it } from "vitest";
import { StatusSolicitacao } from "../entities/Solicitation.js";
import { StatusHistory, TipoRegistro } from "../entities/StatusHistory.js";
import type {
  NewStatusHistory,
  SolicitationState,
  StatusHistoryRepository,
} from "../repositories/statusHistoryRepository.js";
import {
  createStatusHistoryService,
  InvalidStatusHistoryError,
  NotResponsibleError,
  SolicitationClosedError,
  SolicitationNotFoundError,
} from "./statusHistoryService.js";

function createFakeRepository(
  existingSolicitations: number[] = [],
  states: Record<number, SolicitationState> = {},
) {
  const saved: { entry: NewStatusHistory; manager?: EntityManager }[] = [];
  const listed: number[] = [];
  const repository: StatusHistoryRepository = {
    async create(entry, manager) {
      saved.push({ entry, manager });
      return Object.assign(new StatusHistory(), entry, {
        id: saved.length,
        dataHora: new Date(),
      });
    },
    async solicitationExists(solicitacaoId) {
      return existingSolicitations.includes(solicitacaoId);
    },
    async findSolicitationState(solicitacaoId) {
      return states[solicitacaoId] ?? null;
    },
    async listBySolicitation(solicitacaoId) {
      listed.push(solicitacaoId);
      return saved
        .filter(({ entry }) => entry.solicitacaoId === solicitacaoId)
        .map(({ entry }, index) =>
          Object.assign(new StatusHistory(), entry, { id: index + 1 }),
        );
    },
  };
  return { repository, saved, listed };
}

const author = { solicitacaoId: 7, autorId: "user-1" };

describe("status history service", () => {
  it("records the opening as Em Aberto, with the author (US018 CA2)", async () => {
    const { repository, saved } = createFakeRepository();

    await createStatusHistoryService(repository).recordOpening(author);

    expect(saved.at(0)?.entry).toEqual({
      ...author,
      tipo: TipoRegistro.ABERTURA,
      statusAnterior: null,
      statusNovo: StatusSolicitacao.EM_ABERTO,
      descricao: null,
    });
  });

  it("records a status change with the previous and the new status (US018 CA1)", async () => {
    const { repository, saved } = createFakeRepository();

    await createStatusHistoryService(repository).recordStatusChange({
      ...author,
      statusAnterior: StatusSolicitacao.EM_ABERTO,
      statusNovo: StatusSolicitacao.EM_ATENDIMENTO,
    });

    expect(saved.at(0)?.entry).toEqual({
      ...author,
      tipo: TipoRegistro.MUDANCA_STATUS,
      statusAnterior: StatusSolicitacao.EM_ABERTO,
      statusNovo: StatusSolicitacao.EM_ATENDIMENTO,
      descricao: null,
    });
  });

  it("refuses a change to the same status and saves nothing", async () => {
    const { repository, saved } = createFakeRepository();

    await expect(
      createStatusHistoryService(repository).recordStatusChange({
        ...author,
        statusAnterior: StatusSolicitacao.EM_ABERTO,
        statusNovo: StatusSolicitacao.EM_ABERTO,
      }),
    ).rejects.toBeInstanceOf(InvalidStatusHistoryError);
    expect(saved).toHaveLength(0);
  });

  it("records an observation without the surrounding spaces", async () => {
    const { repository, saved } = createFakeRepository();

    await createStatusHistoryService(repository).recordObservation({
      ...author,
      descricao: "  Troquei o disjuntor  ",
    });

    expect(saved.at(0)?.entry).toEqual({
      ...author,
      tipo: TipoRegistro.OBSERVACAO,
      statusAnterior: null,
      statusNovo: null,
      descricao: "Troquei o disjuntor",
    });
  });

  it("refuses a blank observation and saves nothing", async () => {
    const { repository, saved } = createFakeRepository();

    await expect(
      createStatusHistoryService(repository).recordObservation({
        ...author,
        descricao: "   ",
      }),
    ).rejects.toBeInstanceOf(InvalidStatusHistoryError);
    expect(saved).toHaveLength(0);
  });

  it("uses the transaction it receives", async () => {
    const { repository, saved } = createFakeRepository();
    const manager = {} as EntityManager;
    const service = createStatusHistoryService(repository);

    await service.recordOpening(author, manager);
    await service.recordStatusChange(
      {
        ...author,
        statusAnterior: StatusSolicitacao.EM_ABERTO,
        statusNovo: StatusSolicitacao.CONCLUIDO,
      },
      manager,
    );
    await service.recordObservation({ ...author, descricao: "Ok" }, manager);

    expect(saved.map((call) => call.manager)).toEqual([
      manager,
      manager,
      manager,
    ]);
  });

  it("lists the records of an existing solicitation", async () => {
    const { repository } = createFakeRepository([author.solicitacaoId]);
    const service = createStatusHistoryService(repository);
    await service.recordOpening(author);

    const history = await service.listBySolicitation(author.solicitacaoId);

    expect(history?.map(({ tipo }) => tipo)).toEqual([TipoRegistro.ABERTURA]);
  });

  it("answers null for a solicitation that does not exist", async () => {
    const { repository, listed } = createFakeRepository();

    await expect(
      createStatusHistoryService(repository).listBySolicitation(99),
    ).resolves.toBeNull();
    expect(listed).toHaveLength(0);
  });
});

describe("observations added through the route (US017)", () => {
  const inService = (responsavelId: string | null) => ({
    7: { responsavelId, status: StatusSolicitacao.EM_ATENDIMENTO },
  });

  it("records the observation of the person in charge (CA1)", async () => {
    const { repository, saved } = createFakeRepository([], inService("user-1"));

    await createStatusHistoryService(repository).addObservation({
      ...author,
      descricao: " Troquei o disjuntor ",
    });

    expect(saved.at(0)?.entry).toEqual({
      ...author,
      tipo: TipoRegistro.OBSERVACAO,
      statusAnterior: null,
      statusNovo: null,
      descricao: "Troquei o disjuntor",
    });
  });

  it("adds a new record without touching the previous ones (CA2)", async () => {
    const { repository, saved } = createFakeRepository([], inService("user-1"));
    const service = createStatusHistoryService(repository);

    await service.addObservation({ ...author, descricao: "Primeira" });
    await service.addObservation({ ...author, descricao: "Segunda" });

    expect(saved.map(({ entry }) => entry.descricao)).toEqual([
      "Primeira",
      "Segunda",
    ]);
  });

  it.each([
    ["someone else is in charge", "user-2"],
    ["nobody is in charge yet", null],
  ])("refuses when %s and saves nothing", async (_case, responsavelId) => {
    const { repository, saved } = createFakeRepository(
      [],
      inService(responsavelId),
    );

    await expect(
      createStatusHistoryService(repository).addObservation({
        ...author,
        descricao: "Ok",
      }),
    ).rejects.toBeInstanceOf(NotResponsibleError);
    expect(saved).toHaveLength(0);
  });

  it.each([StatusSolicitacao.CONCLUIDO, StatusSolicitacao.CANCELADA])(
    "refuses a solicitation that is %s",
    async (status) => {
      const { repository, saved } = createFakeRepository([], {
        7: { responsavelId: "user-1", status },
      });

      await expect(
        createStatusHistoryService(repository).addObservation({
          ...author,
          descricao: "Ok",
        }),
      ).rejects.toBeInstanceOf(SolicitationClosedError);
      expect(saved).toHaveLength(0);
    },
  );

  it("refuses a solicitation that does not exist", async () => {
    const { repository } = createFakeRepository();

    await expect(
      createStatusHistoryService(repository).addObservation({
        ...author,
        descricao: "Ok",
      }),
    ).rejects.toBeInstanceOf(SolicitationNotFoundError);
  });
});
