import type {
  SolicitationListFilters,
  SolicitationListResult,
  SolicitationRepository,
} from "../repositories/solicitationRepository.js";
import type { PublicSessionUser } from "./sessionService.js";
import type { SolicitationListQuery } from "../validators/solicitationValidators.js";

export interface SolicitationService {
  list(
    query: SolicitationListQuery,
    user: Pick<PublicSessionUser, "id" | "role">,
  ): Promise<SolicitationListResult>;
}

export function createSolicitationService(
  repository: SolicitationRepository,
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
  };
}
