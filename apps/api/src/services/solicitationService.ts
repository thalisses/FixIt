import { isAuthorized } from "../auth/authorization.js";
import {
  Solicitation,
  StatusSolicitacao,
} from "../entities/Solicitation.js";
import type {
  SolicitationListFilters,
  SolicitationListResult,
  SolicitationRepository,
} from "../repositories/solicitationRepository.js";
import type { PublicSessionUser } from "./sessionService.js";
import {
  SolicitationNotFoundError,
  type StatusHistoryService,
} from "./statusHistoryService.js";
import type { SolicitationListQuery } from "../validators/solicitationValidators.js";

export class ForbiddenSolicitationError extends Error {
  constructor() {
    super("Você não tem permissão para acessar esta solicitação.");
    this.name = "ForbiddenSolicitationError";
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor() {
    super("Esta transição de status não é permitida.");
    this.name = "InvalidStatusTransitionError";
  }
}

export class StatusHistoryUnavailableError extends Error {
  constructor() {
    super("O histórico de status não está disponível.");
    this.name = "StatusHistoryUnavailableError";
  }
}

export interface SolicitationService {
  list(
    query: SolicitationListQuery,
    user: Pick<PublicSessionUser, "id" | "role">,
  ): Promise<SolicitationListResult>;
  get(
    id: number,
    user: Pick<PublicSessionUser, "id" | "role">,
  ): Promise<Solicitation>;
  changeStatus(
    id: number,
    status: StatusSolicitacao,
    user: Pick<PublicSessionUser, "id" | "role">,
  ): Promise<Solicitation>;
}

function scopeOf(solicitation: Solicitation) {
  return {
    ownerId: solicitation.solicitanteId,
    assignedMaintainerId: solicitation.responsavelId,
  };
}

function canTransition(
  current: StatusSolicitacao,
  next: StatusSolicitacao,
): boolean {
  if (current === StatusSolicitacao.EM_ABERTO) {
    return next === StatusSolicitacao.EM_ATENDIMENTO;
  }
  if (current === StatusSolicitacao.EM_ATENDIMENTO) {
    return next === StatusSolicitacao.CONCLUIDO;
  }
  return false;
}

export function createSolicitationService(
  repository: SolicitationRepository,
  statusHistoryService?: StatusHistoryService,
): SolicitationService {
  return {
    list(query, user) {
      const filters: SolicitationListFilters = {
        ...query,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      };

      return repository.list(filters, {
        role: user.role,
        userId: user.id,
      });
    },

    async get(id, user) {
      const solicitation = await repository.findById(id);
      if (!solicitation) {
        throw new SolicitationNotFoundError();
      }
      if (!isAuthorized(user, "request:read", scopeOf(solicitation))) {
        throw new ForbiddenSolicitationError();
      }
      return solicitation;
    },

    async changeStatus(id, status, user) {
      if (!statusHistoryService) {
        throw new StatusHistoryUnavailableError();
      }

      await repository.transaction(async (transaction) => {
        const solicitation = await transaction.findByIdForUpdate(id);
        if (!solicitation) {
          throw new SolicitationNotFoundError();
        }
        if (!isAuthorized(user, "request:update", scopeOf(solicitation))) {
          throw new ForbiddenSolicitationError();
        }
        if (!canTransition(solicitation.status, status)) {
          throw new InvalidStatusTransitionError();
        }

        const previousStatus = solicitation.status;
        solicitation.status = status;
        solicitation.dataConclusao =
          status === StatusSolicitacao.CONCLUIDO ? new Date() : null;
        await transaction.save(solicitation);

        await statusHistoryService.recordStatusChange(
          {
            solicitacaoId: id,
            autorId: user.id,
            statusAnterior: previousStatus,
            statusNovo: status,
          },
          transaction.manager,
        );
      });

      const updated = await repository.findById(id);
      if (!updated) {
        throw new SolicitationNotFoundError();
      }
      return updated;
    },
  };
}
