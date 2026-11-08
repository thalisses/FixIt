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

/** O que decide quem lê o histórico (US018) e quem registra observações (US017). */
export interface SolicitationState {
  solicitanteId: string;
  responsavelId: string | null;
  status: StatusSolicitacao;
}

export interface StatusHistoryRepository {
  create(
    entry: NewStatusHistory,
    manager?: EntityManager,
  ): Promise<StatusHistory>;
  /** Devolve null quando a solicitação não existe. */
  findSolicitationState(
    solicitacaoId: number,
  ): Promise<SolicitationState | null>;
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

    async findSolicitationState(solicitacaoId) {
      const solicitation = await dataSource.getRepository(Solicitation).findOne({
        where: { id: solicitacaoId },
        select: {
          id: true,
          solicitanteId: true,
          responsavelId: true,
          status: true,
        },
      });
      return solicitation
        ? {
            solicitanteId: solicitation.solicitanteId,
            responsavelId: solicitation.responsavelId,
            status: solicitation.status,
          }
        : null;
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
