import type { DataSource, SelectQueryBuilder } from "typeorm";
import {
  Solicitation,
  StatusSolicitacao,
  type AreaTecnica,
} from "../entities/Solicitation.js";

export interface MaintenanceReportFilters {
  de?: string;
  ate?: string;
  setor?: string;
  tipo?: AreaTecnica;
  status?: StatusSolicitacao;
}

export interface MaintenanceReport {
  total: number;
  byStatus: Record<StatusSolicitacao, number>;
  averageResolutionHours: number | null;
  topAssets: Array<{
    asset: {
      id: number;
      codigoPatrimonial: string;
      descricao: string;
    };
    count: number;
  }>;
  hasData: boolean;
}

export interface ReportRepository {
  getMaintenanceReport(
    filters?: MaintenanceReportFilters,
  ): Promise<MaintenanceReport>;
}

const EMPTY_BY_STATUS: Record<StatusSolicitacao, number> = {
  [StatusSolicitacao.EM_ABERTO]: 0,
  [StatusSolicitacao.EM_ATENDIMENTO]: 0,
  [StatusSolicitacao.CONCLUIDO]: 0,
  [StatusSolicitacao.CANCELADA]: 0,
};

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

function applyFilters(
  query: SelectQueryBuilder<Solicitation>,
  filters: MaintenanceReportFilters,
): SelectQueryBuilder<Solicitation> {
  if (filters.status) {
    query.andWhere("solicitation.status = :reportStatus", {
      reportStatus: filters.status,
    });
  }
  if (filters.setor) {
    query.andWhere("solicitation.setor_responsavel ILIKE :reportSetor", {
      reportSetor: `%${escapeLike(filters.setor)}%`,
    });
  }
  if (filters.tipo) {
    query.andWhere("solicitation.tipo_problema = :reportTipo", {
      reportTipo: filters.tipo,
    });
  }
  if (filters.de) {
    query.andWhere("CAST(solicitation.data AS date) >= :reportDe", {
      reportDe: filters.de,
    });
  }
  if (filters.ate) {
    query.andWhere("CAST(solicitation.data AS date) <= :reportAte", {
      reportAte: filters.ate,
    });
  }
  return query;
}

export function createReportRepository(
  dataSource: DataSource,
): ReportRepository {
  function baseQuery(
    filters: MaintenanceReportFilters,
  ): SelectQueryBuilder<Solicitation> {
    return applyFilters(
      dataSource.getRepository(Solicitation).createQueryBuilder("solicitation"),
      filters,
    );
  }

  return {
    async getMaintenanceReport(filters = {}) {
      const total = await baseQuery(filters).getCount();
      if (total === 0) {
        return {
          total: 0,
          byStatus: { ...EMPTY_BY_STATUS },
          averageResolutionHours: null,
          topAssets: [],
          hasData: false,
        };
      }

      const statusRows = await baseQuery(filters)
        .select("solicitation.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("solicitation.status")
        .getRawMany<{ status: StatusSolicitacao; count: string }>();

      const byStatus = { ...EMPTY_BY_STATUS };
      for (const row of statusRows) {
        byStatus[row.status] = Number(row.count);
      }

      const averageRow = await baseQuery(filters)
        .select(
          "AVG(EXTRACT(EPOCH FROM (solicitation.data_conclusao - solicitation.data)))",
          "seconds",
        )
        .andWhere("solicitation.status = :concludedStatus", {
          concludedStatus: StatusSolicitacao.CONCLUIDO,
        })
        .andWhere("solicitation.data_conclusao IS NOT NULL")
        .getRawOne<{ seconds: string | null }>();

      const averageResolutionHours =
        averageRow?.seconds === null || averageRow?.seconds === undefined
          ? null
          : Math.round((Number(averageRow.seconds) / 3600) * 100) / 100;

      const topAssetRows = await baseQuery(filters)
        .innerJoin("solicitation.bem", "asset")
        .select("asset.id", "id")
        .addSelect("asset.codigo_patrimonial", "codigoPatrimonial")
        .addSelect("asset.descricao", "descricao")
        .addSelect("COUNT(*)", "count")
        .groupBy("asset.id")
        .addGroupBy("asset.codigo_patrimonial")
        .addGroupBy("asset.descricao")
        .orderBy("COUNT(*)", "DESC")
        .addOrderBy("asset.codigo_patrimonial", "ASC")
        .limit(5)
        .getRawMany<{
          id: number;
          codigoPatrimonial: string;
          descricao: string;
          count: string;
        }>();

      return {
        total,
        byStatus,
        averageResolutionHours,
        topAssets: topAssetRows.map((row) => ({
          asset: {
            id: Number(row.id),
            codigoPatrimonial: row.codigoPatrimonial,
            descricao: row.descricao,
          },
          count: Number(row.count),
        })),
        hasData: true,
      };
    },
  };
}
