import type { DataSource } from "typeorm";
import {
  Solicitation,
  type AreaTecnica,
  type NivelPrioridade,
  type StatusSolicitacao,
} from "../entities/Solicitation.js";
import { UserRole } from "../entities/User.js";

export interface SolicitationListFilters {
  status?: StatusSolicitacao;
  setor?: string;
  tipo?: AreaTecnica;
  prioridade?: NivelPrioridade;
  responsavelId?: string;
  de?: string;
  ate?: string;
  semResponsavel?: boolean;
  page: number;
  pageSize: number;
}

export interface SolicitationListScope {
  role: UserRole;
  userId: string;
}

export interface SolicitationListResult {
  solicitations: Solicitation[];
  totalItems: number;
}

export interface SolicitationRepository {
  list(
    filters: SolicitationListFilters,
    scope: SolicitationListScope,
  ): Promise<SolicitationListResult>;
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

export function createSolicitationRepository(
  dataSource: DataSource,
): SolicitationRepository {
  return {
    async list(filters, scope) {
      const query = dataSource
        .getRepository(Solicitation)
        .createQueryBuilder("solicitation")
        .leftJoinAndSelect("solicitation.solicitante", "solicitante")
        .leftJoinAndSelect("solicitation.responsavel", "responsavel")
        .leftJoinAndSelect("solicitation.bem", "bem")
        .addSelect(
          `CASE solicitation.prioridade
             WHEN 'ALTA' THEN 1
             WHEN 'MEDIA' THEN 2
             WHEN 'BAIXA' THEN 3
             ELSE 4
           END`,
          "priority_order",
        )
        .orderBy("priority_order", "ASC")
        .addOrderBy("solicitation.data", "ASC")
        .addOrderBy("solicitation.id", "ASC");

      if (scope.role === UserRole.MANUTENTOR) {
        query.andWhere("solicitation.responsavel_id = :userId", {
          userId: scope.userId,
        });
      } else if (scope.role === UserRole.CLIENTE) {
        query.andWhere("solicitation.solicitante_id = :userId", {
          userId: scope.userId,
        });
      }

      if (filters.status) {
        query.andWhere("solicitation.status = :status", {
          status: filters.status,
        });
      }
      if (filters.setor) {
        query.andWhere("solicitation.setor_responsavel ILIKE :setor", {
          setor: `%${escapeLike(filters.setor)}%`,
        });
      }
      if (filters.tipo) {
        query.andWhere("solicitation.tipo_problema = :tipo", {
          tipo: filters.tipo,
        });
      }
      if (filters.prioridade) {
        query.andWhere("solicitation.prioridade = :prioridade", {
          prioridade: filters.prioridade,
        });
      }
      if (filters.responsavelId) {
        query.andWhere("solicitation.responsavel_id = :responsavelId", {
          responsavelId: filters.responsavelId,
        });
      }
      if (filters.semResponsavel) {
        query.andWhere("solicitation.responsavel_id IS NULL");
      }
      if (filters.de) {
        query.andWhere("CAST(solicitation.data AS date) >= :de", {
          de: filters.de,
        });
      }
      if (filters.ate) {
        query.andWhere("CAST(solicitation.data AS date) <= :ate", {
          ate: filters.ate,
        });
      }

      const [solicitations, totalItems] = await query
        .skip((filters.page - 1) * filters.pageSize)
        .take(filters.pageSize)
        .getManyAndCount();

      return { solicitations, totalItems };
    },
  };
}
