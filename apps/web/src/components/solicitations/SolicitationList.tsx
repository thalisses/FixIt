import {
  formatDay,
  StatusBadge,
  tipoProblemaLabels,
} from "../assets/assetPresentation";
import type { SolicitationListItem } from "../../lib/solicitationApi";
import {
  formatProtocol,
  PriorityBadge,
  UrgencyBadge,
} from "./solicitationPresentation";

interface SolicitationListProps {
  solicitations: SolicitationListItem[];
}

export function SolicitationList({ solicitations }: SolicitationListProps) {
  return (
    <div className="asset-table-card">
      <table className="asset-table solicitation-table">
        <thead>
          <tr>
            <th scope="col">Protocolo / data</th>
            <th scope="col">Solicitante</th>
            <th scope="col">Bem vinculado</th>
            <th scope="col">Tipo / setor</th>
            <th scope="col">Urgência</th>
            <th scope="col">Prioridade</th>
            <th scope="col">Responsável</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {solicitations.map((solicitation) => (
            <tr key={solicitation.id}>
              <td data-label="Protocolo / data">
                <span className="solicitation-cell-stack">
                  <span className="solicitation-protocol">
                    {formatProtocol(solicitation)}
                  </span>
                  <span className="solicitation-date">
                    {formatDay(solicitation.data)}
                  </span>
                </span>
              </td>
              <td data-label="Solicitante">
                {solicitation.solicitante?.fullName ?? "Não informado"}
              </td>
              <td data-label="Bem vinculado">
                {solicitation.bem ? (
                  <span className="solicitation-cell-stack solicitation-asset">
                    <span className="asset-code">
                      {solicitation.bem.codigoPatrimonial}
                    </span>
                    <span>{solicitation.bem.descricao}</span>
                  </span>
                ) : (
                  <span className="solicitation-muted">Sem bem</span>
                )}
              </td>
              <td data-label="Tipo / setor">
                <span className="solicitation-cell-stack">
                  <span>{tipoProblemaLabels[solicitation.tipoProblema]}</span>
                  {solicitation.setorResponsavel && (
                    <span className="solicitation-muted">
                      {solicitation.setorResponsavel}
                    </span>
                  )}
                </span>
              </td>
              <td data-label="Urgência">
                <UrgencyBadge urgency={solicitation.urgencia} />
              </td>
              <td data-label="Prioridade">
                <PriorityBadge priority={solicitation.prioridade} />
              </td>
              <td data-label="Responsável">
                {solicitation.responsavel ? (
                  solicitation.responsavel.fullName
                ) : (
                  <span className="solicitation-muted">Não atribuído</span>
                )}
              </td>
              <td data-label="Status">
                <StatusBadge status={solicitation.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
