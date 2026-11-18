import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import {
  getMaintenanceReport,
  ReportApiError,
  type MaintenanceReport,
} from "../lib/reportApi";
import "../styles/reports.css";

interface ReportsPageProps {
  onLoggedOut(): void;
  onNavigate(path: string): void;
}

const statusCards = [
  { key: "EM_ABERTO", label: "Em aberto", className: "em-aberto" },
  { key: "EM_ATENDIMENTO", label: "Em atendimento", className: "em-atendimento" },
  { key: "CONCLUIDO", label: "Concluídas", className: "concluido" },
  { key: "CANCELADA", label: "Canceladas", className: "cancelada" },
] as const;

function formatAverage(hours: number | null): string {
  if (hours === null) {
    return "Sem solicitações concluídas";
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} h`;
  }
  return `${(hours / 24).toFixed(1)} dias`;
}

export function ReportsPage({ onLoggedOut, onNavigate }: ReportsPageProps) {
  const { refresh } = useAuth();
  const [report, setReport] = useState<MaintenanceReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  const handleError = useCallback(
    (error: unknown): string => {
      if (error instanceof ReportApiError && error.status === 401) {
        void refresh();
        return "Sua sessão expirou. Entre novamente.";
      }
      if (error instanceof ReportApiError) {
        return error.message;
      }
      return "Não foi possível conectar ao servidor. Tente novamente.";
    },
    [refresh],
  );

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage("");

    void getMaintenanceReport()
      .then((result) => {
        if (isCurrent) {
          setReport(result);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setErrorMessage(handleError(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [reloadCount, handleError]);

  return (
    <AppShell
      activePath="/reports"
      onLoggedOut={onLoggedOut}
      onNavigate={onNavigate}
    >
      <section className="asset-page" aria-labelledby="reports-title">
        <div className="asset-page-heading">
          <div>
            <h1 id="reports-title">Relatórios</h1>
            <p>Visão consolidada das solicitações de manutenção.</p>
          </div>
        </div>

        {errorMessage ? (
          <div className="management-error">
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
            <button
              className="text-action"
              onClick={() => setReloadCount((current) => current + 1)}
              type="button"
            >
              Tentar novamente
            </button>
          </div>
        ) : isLoading ? (
          <div className="asset-loading" role="status" aria-busy="true">
            Carregando indicadores...
          </div>
        ) : !report || !report.hasData ? (
          <div className="asset-empty" role="status">
            <p>
              Ainda não há solicitações registradas. O painel será preenchido
              quando houver chamados.
            </p>
          </div>
        ) : (
          <>
            <div className="report-summary-grid">
              <article className="report-card report-total">
                <span className="report-card-label">Total de solicitações</span>
                <strong>{report.total}</strong>
                <span className="report-card-note">
                  Chamados registrados no sistema
                </span>
              </article>

              <article className="report-card report-average">
                <span className="report-card-label">
                  Tempo médio até conclusão
                </span>
                <strong>{formatAverage(report.averageResolutionHours)}</strong>
                <span className="report-card-note">
                  Considera apenas solicitações concluídas
                </span>
              </article>
            </div>

            <section aria-labelledby="report-status-title">
              <h2 id="report-status-title" className="report-section-title">
                Solicitações por status
              </h2>
              <div className="report-status-grid">
                {statusCards.map((card) => (
                  <article
                    className={`report-status-card report-status-${card.className}`}
                    key={card.key}
                  >
                    <span>{card.label}</span>
                    <strong>{report.byStatus[card.key]}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section
              aria-labelledby="report-assets-title"
              className="report-assets"
            >
              <div className="report-section-heading">
                <div>
                  <h2 id="report-assets-title" className="report-section-title">
                    Bens com mais solicitações
                  </h2>
                  <p className="asset-muted">
                    Os cinco equipamentos com maior volume de chamados.
                  </p>
                </div>
              </div>

              {report.topAssets.length === 0 ? (
                <div className="asset-empty" role="status">
                  <p>
                    Nenhuma solicitação está vinculada a um bem patrimonial.
                  </p>
                </div>
              ) : (
                <div className="asset-table-card">
                  <table className="asset-table report-table">
                    <thead>
                      <tr>
                        <th scope="col">Posição</th>
                        <th scope="col">Bem</th>
                        <th scope="col">Código</th>
                        <th scope="col">Solicitações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topAssets.map((entry, index) => (
                        <tr key={entry.asset.id}>
                          <td data-label="Posição">
                            <span className="report-rank">{index + 1}</span>
                          </td>
                          <td data-label="Bem">{entry.asset.descricao}</td>
                          <td className="asset-code" data-label="Código">
                            {entry.asset.codigoPatrimonial}
                          </td>
                          <td data-label="Solicitações">
                            <strong>{entry.count}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </AppShell>
  );
}
