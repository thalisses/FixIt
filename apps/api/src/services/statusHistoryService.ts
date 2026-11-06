import type { EntityManager } from "typeorm";
import { StatusSolicitacao } from "../entities/Solicitation.js";
import { TipoRegistro, type StatusHistory } from "../entities/StatusHistory.js";
import type { StatusHistoryRepository } from "../repositories/statusHistoryRepository.js";

export class InvalidStatusHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusHistoryError";
  }
}

interface Author {
  solicitacaoId: number;
  autorId: string;
}

interface StatusChange extends Author {
  statusAnterior: StatusSolicitacao;
  statusNovo: StatusSolicitacao;
}

interface Observation extends Author {
  descricao: string;
}

/**
 * Para gravar o histórico junto com outra alteração, passe o `manager`
 * da transação aberta: as duas gravações entram ou saem juntas.
 */
export interface StatusHistoryService {
  recordOpening(entry: Author, manager?: EntityManager): Promise<StatusHistory>;
  recordStatusChange(
    entry: StatusChange,
    manager?: EntityManager,
  ): Promise<StatusHistory>;
  recordObservation(
    entry: Observation,
    manager?: EntityManager,
  ): Promise<StatusHistory>;
}

export function createStatusHistoryService(
  repository: StatusHistoryRepository,
): StatusHistoryService {
  return {
    recordOpening({ solicitacaoId, autorId }, manager) {
      return repository.create(
        {
          solicitacaoId,
          autorId,
          tipo: TipoRegistro.ABERTURA,
          statusAnterior: null,
          statusNovo: StatusSolicitacao.EM_ABERTO,
          descricao: null,
        },
        manager,
      );
    },

    async recordStatusChange(
      { solicitacaoId, autorId, statusAnterior, statusNovo },
      manager,
    ) {
      if (statusAnterior === statusNovo) {
        throw new InvalidStatusHistoryError(
          "O novo status precisa ser diferente do atual.",
        );
      }

      return repository.create(
        {
          solicitacaoId,
          autorId,
          tipo: TipoRegistro.MUDANCA_STATUS,
          statusAnterior,
          statusNovo,
          descricao: null,
        },
        manager,
      );
    },

    async recordObservation({ solicitacaoId, autorId, descricao }, manager) {
      const text = descricao.trim();
      if (!text) {
        throw new InvalidStatusHistoryError("A observação precisa de texto.");
      }

      return repository.create(
        {
          solicitacaoId,
          autorId,
          tipo: TipoRegistro.OBSERVACAO,
          statusAnterior: null,
          statusNovo: null,
          descricao: text,
        },
        manager,
      );
    },
  };
}
