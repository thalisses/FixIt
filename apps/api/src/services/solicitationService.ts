import { isAuthorized } from "../auth/authorization.js";
import {
  AreaTecnica,
  NivelPrioridade,
  Solicitation,
  StatusSolicitacao,
} from "../entities/Solicitation.js";
import { UserSpecialty } from "../entities/User.js";
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

export class SolicitationNotCancelableError extends Error {
  constructor(message = "Só solicitações em aberto podem ser canceladas.") {
    super(message);
    this.name = "SolicitationNotCancelableError";
  }
}

export class StatusHistoryUnavailableError extends Error {
  constructor() {
    super("O histórico de status não está disponível.");
    this.name = "StatusHistoryUnavailableError";
  }
}

export class MaintainerNotFoundError extends Error {
  constructor() {
    super("Manutentor não encontrado ou inativo.");
    this.name = "MaintainerNotFoundError";
  }
}

export interface MaintainerCandidate {
  id: string;
  fullName: string;
  specialty: UserSpecialty | null;
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
  changePriority(
    id: number,
    prioridade: NivelPrioridade,
    user: Pick<PublicSessionUser, "id" | "role">,
  ): Promise<Solicitation>;
  listMaintainers(
    id: number,
    user: Pick<PublicSessionUser, "id" | "role">,
  ): Promise<MaintainerCandidate[]>;
  assignMaintainer(
    id: number,
    maintainerId: string,
    user: Pick<PublicSessionUser, "id" | "role">,
  ): Promise<Solicitation>;
  cancel(
    id: number,
    motivo: string,
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

function toUserSpecialty(area: AreaTecnica): UserSpecialty {
  switch (area) {
    case AreaTecnica.ELETRICA:
      return UserSpecialty.ELETRICA;
    case AreaTecnica.HIDRAULICA:
      return UserSpecialty.HIDRAULICA;
    case AreaTecnica.INFORMATICA:
      return UserSpecialty.INFORMATICA;
    case AreaTecnica.ESTRUTURAL:
      return UserSpecialty.ESTRUTURAL;
    case AreaTecnica.OUTROS:
      return UserSpecialty.OUTROS;
  }
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

    async changePriority(id, prioridade, user) {
      if (!isAuthorized(user, "request:manage")) {
        throw new ForbiddenSolicitationError();
      }

      const updated = await repository.updatePriority(id, prioridade);
      if (!updated) {
        throw new SolicitationNotFoundError();
      }

      const withRelations = await repository.findById(id);
      if (!withRelations) {
        throw new SolicitationNotFoundError();
      }
      return withRelations;
    },

    async listMaintainers(id, user) {
      if (!isAuthorized(user, "request:manage")) {
        throw new ForbiddenSolicitationError();
      }
      const solicitation = await repository.findById(id);
      if (!solicitation) {
        throw new SolicitationNotFoundError();
      }

      const matchingSpecialty = toUserSpecialty(solicitation.tipoProblema);
      const maintainers = await repository.listActiveMaintainers();
      return maintainers
        .sort((left, right) => {
          const compatibility =
            Number(right.specialty === matchingSpecialty) -
            Number(left.specialty === matchingSpecialty);
          return (
            compatibility ||
            left.fullName.localeCompare(right.fullName, "pt-BR") ||
            left.id.localeCompare(right.id)
          );
        })
        .map(({ id: maintainerId, fullName, specialty }) => ({
          id: maintainerId,
          fullName,
          specialty,
        }));
    },

    async assignMaintainer(id, maintainerId, user) {
      if (!isAuthorized(user, "request:manage")) {
        throw new ForbiddenSolicitationError();
      }
      if (!statusHistoryService) {
        throw new StatusHistoryUnavailableError();
      }

      await repository.transaction(async (transaction) => {
        const solicitation = await transaction.findByIdForUpdate(id);
        if (!solicitation) {
          throw new SolicitationNotFoundError();
        }
        const maintainer =
          await transaction.findActiveMaintainerForUpdate(maintainerId);
        if (!maintainer) {
          throw new MaintainerNotFoundError();
        }
        if (solicitation.responsavelId === maintainer.id) {
          return;
        }

        solicitation.responsavelId = maintainer.id;
        await transaction.save(solicitation);
        await statusHistoryService.recordAssignment(
          {
            solicitacaoId: id,
            autorId: user.id,
            descricao: `Responsável atribuído: ${maintainer.fullName}`,
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

    async cancel(id, motivo, user) {
      if (!isAuthorized(user, "request:manage")) {
        throw new ForbiddenSolicitationError();
      }
      if (!statusHistoryService) {
        throw new StatusHistoryUnavailableError();
      }

      await repository.transaction(async (transaction) => {
        const solicitation = await transaction.findByIdForUpdate(id);
        if (!solicitation) {
          throw new SolicitationNotFoundError();
        }
        if (solicitation.status === StatusSolicitacao.CONCLUIDO) {
          throw new SolicitationNotCancelableError(
            "Solicitações concluídas não podem ser canceladas.",
          );
        }
        if (solicitation.status !== StatusSolicitacao.EM_ABERTO) {
          throw new SolicitationNotCancelableError();
        }

        solicitation.status = StatusSolicitacao.CANCELADA;
        solicitation.dataConclusao = null;
        await transaction.save(solicitation);
        await statusHistoryService.recordCancellation(
          {
            solicitacaoId: id,
            autorId: user.id,
            motivo,
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
