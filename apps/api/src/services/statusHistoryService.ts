import type { EntityManager } from "typeorm";
import { isAuthorized } from "../auth/authorization.js";
import { StatusSolicitacao } from "../entities/Solicitation.js";
import { TipoRegistro, type StatusHistory } from "../entities/StatusHistory.js";
import type { StatusHistoryRepository } from "../repositories/statusHistoryRepository.js";
import type { PublicSessionUser } from "./sessionService.js";

export class InvalidStatusHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusHistoryError";
  }
}

export class SolicitationNotFoundError extends Error {
  constructor() {
    super("Solicitação não encontrada.");
    this.name = "SolicitationNotFoundError";
  }
}

export class HistoryAccessDeniedError extends Error {
  constructor() {
    super("Você não tem permissão para acessar esta solicitação.");
    this.name = "HistoryAccessDeniedError";
  }
}

export class NotResponsibleError extends Error {
  constructor() {
    super("Só o responsável pela solicitação pode registrar observações.");
    this.name = "NotResponsibleError";
  }
}

export class SolicitationClosedError extends Error {
  constructor() {
    super("A solicitação já foi encerrada.");
    this.name = "SolicitationClosedError";
  }
}

const CLOSED_STATUSES = new Set([
  StatusSolicitacao.CONCLUIDO,
  StatusSolicitacao.CANCELADA,
]);

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
  recordAssignment(
    entry: Observation,
    manager?: EntityManager,
  ): Promise<StatusHistory>;
  /**
   * Observação registrada pela rota (US017): só o responsável grava, e só
   * enquanto a solicitação não foi encerrada. Nada é sobrescrito.
   */
  addObservation(entry: Observation): Promise<StatusHistory>;
  /**
   * Devolve null quando a solicitação não existe. Segue a mesma regra de
   * leitura da solicitação: o Manutentor só vê as que estão com ele.
   */
  listBySolicitation(
    solicitacaoId: number,
    viewer: Pick<PublicSessionUser, "id" | "role">,
  ): Promise<StatusHistory[] | null>;
}

export function createStatusHistoryService(
  repository: StatusHistoryRepository,
): StatusHistoryService {
  const service: StatusHistoryService = {
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

    async recordAssignment({ solicitacaoId, autorId, descricao }, manager) {
      const text = descricao.trim();
      if (!text) {
        throw new InvalidStatusHistoryError(
          "A atribuição precisa identificar o Manutentor.",
        );
      }

      return repository.create(
        {
          solicitacaoId,
          autorId,
          tipo: TipoRegistro.ATRIBUICAO,
          statusAnterior: null,
          statusNovo: null,
          descricao: text,
        },
        manager,
      );
    },

    async addObservation(entry) {
      const state = await repository.findSolicitationState(entry.solicitacaoId);
      if (!state) {
        throw new SolicitationNotFoundError();
      }
      if (state.responsavelId !== entry.autorId) {
        throw new NotResponsibleError();
      }
      if (CLOSED_STATUSES.has(state.status)) {
        throw new SolicitationClosedError();
      }

      return service.recordObservation(entry);
    },

    async listBySolicitation(solicitacaoId, viewer) {
      const state = await repository.findSolicitationState(solicitacaoId);
      if (!state) {
        return null;
      }

      const scope = {
        ownerId: state.solicitanteId,
        assignedMaintainerId: state.responsavelId,
      };
      if (!isAuthorized(viewer, "request:read", scope)) {
        throw new HistoryAccessDeniedError();
      }

      return repository.listBySolicitation(solicitacaoId);
    },
  };

  return service;
}
