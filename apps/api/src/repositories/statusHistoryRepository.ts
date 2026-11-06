import type { DataSource, EntityManager } from "typeorm";
import { Solicitation, type StatusSolicitacao } from "../entities/Solicitation.js";
import { StatusHistory, type TipoRegistro } from "../entities/StatusHistory.js";

export interface NewStatusHistory {
  solicitacaoId: number;
  autorId: string;
  tipo: TipoRegistro;
  statusAnterior: StatusSolicitacao | null;
  statusNovo: StatusSolicitacao | null;
  descricao: string | null;
}

export interface StatusHistoryRepository {
  create(
    entry: NewStatusHistory,
    manager?: EntityManager,
  ): Promise<StatusHistory>;
  solicitationExists(solicitacaoId: number): Promise<boolean>;
  /** Do mais antigo para o mais novo, com o autor carregado. */
  listBySolicitation(solicitacaoId: number): Promise<StatusHistory[]>;
}

export function createStatusHistoryRepository(
  dataSource: DataSource,
): StatusHistoryRepository {
  return {
    create(entry, manager = dataSource.manager) {
      const repository = manager.getRepository(StatusHistory);
      return repository.save(repository.create(entry));
    },

    solicitationExists(solicitacaoId) {
      return dataSource
        .getRepository(Solicitation)
        .existsBy({ id: solicitacaoId });
    },

    listBySolicitation(solicitacaoId) {
      // Registros da mesma transação têm a mesma data, então o id desempata.
      return dataSource.getRepository(StatusHistory).find({
        where: { solicitacaoId },
        relations: { autor: true },
        order: { dataHora: "ASC", id: "ASC" },
      });
    },
  };
}
