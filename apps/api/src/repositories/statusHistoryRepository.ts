import type { DataSource, EntityManager } from "typeorm";
import type { StatusSolicitacao } from "../entities/Solicitation.js";
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
}

export function createStatusHistoryRepository(
  dataSource: DataSource,
): StatusHistoryRepository {
  return {
    create(entry, manager = dataSource.manager) {
      const repository = manager.getRepository(StatusHistory);
      return repository.save(repository.create(entry));
    },
  };
}
