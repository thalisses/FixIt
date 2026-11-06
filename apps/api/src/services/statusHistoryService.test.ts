import type { EntityManager } from "typeorm";
import { describe, expect, it } from "vitest";
import { StatusSolicitacao } from "../entities/Solicitation.js";
import { StatusHistory, TipoRegistro } from "../entities/StatusHistory.js";
import type {
  NewStatusHistory,
  StatusHistoryRepository,
} from "../repositories/statusHistoryRepository.js";
import {
  createStatusHistoryService,
  InvalidStatusHistoryError,
} from "./statusHistoryService.js";

function createFakeRepository() {
  const saved: { entry: NewStatusHistory; manager?: EntityManager }[] = [];
  const repository: StatusHistoryRepository = {
    async create(entry, manager) {
      saved.push({ entry, manager });
      return Object.assign(new StatusHistory(), entry, {
        id: saved.length,
        dataHora: new Date(),
      });
    },
  };
  return { repository, saved };
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
});
