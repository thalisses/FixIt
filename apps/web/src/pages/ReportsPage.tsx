import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import {
  formatDate,
  statusLabels,
  tipoProblemaLabels,
} from "../components/assets/assetPresentation";
import {
  emptyReportFilters,
  ReportFiltersForm,
} from "../components/reports/ReportFilters";
import { useAuth } from "../context/AuthContext";
import {
  getMaintenanceReport,
  ReportApiError,
  type MaintenanceReport,
  type ReportFilters,
} from "../lib/reportApi";
import { generateReportCsv } from "../lib/reportCsv";
import { formatReportAverage } from "../lib/reportPresentation";
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

export function ReportsPage({ onLoggedOut, onNavigate }: ReportsPageProps) {
  const { refresh } = useAuth();
  const [report, setReport] = useState<MaintenanceReport | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(emptyReportFilters);
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

    void getMaintenanceReport(filters)
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
  }, [filters, reloadCount, handleError]);

  const hasFilters = Boolean(
    filters.de ||
      filters.ate ||
      filters.setor?.trim() ||
      filters.tipo ||
      filters.status,
  );

  function applyFilters(nextFilters: ReportFilters) {
    if (nextFilters === filters) {
      return;
    }
    setIsLoading(true);
    setFilters(nextFilters);
  }

  function clearFilters() {
    applyFilters(emptyReportFilters);
  }

  const displayedReport = !errorMessage && !isLoading && report?.hasData
    ? report
    : null;

  function exportCsv() {
    if (!displayedReport) {
      return;
    }

    // The UTF-8 BOM helps Excel detect the encoding.
    const csv = new Blob(["\uFEFF", generateReportCsv(displayedReport)], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(csv);
    try {
      link.href = url;
      link.download = "relatorio-manutencao.csv";
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  return (
    <AppShell
      activePath="/reports"
      onLoggedOut={onLoggedOut}
      onNavigate={onNavigate}
    >
      <section className="asset-page reports-page" aria-labelledby="reports-title">
        <div className="asset-page-heading">
          <div>
            <h1 id="reports-title">Relatórios</h1>
            <p>Visão consolidada das solicitações de manutenção.</p>
          </div>
          <div className="report-page-actions">
            <button
              className="primary-action"
              disabled={!displayedReport}
              onClick={exportCsv}
              type="button"
            >
              Exportar CSV
            </button>
            <button
              className="primary-action"
              disabled={!displayedReport}
              onClick={() => window.print()}
              type="button"
            >
              Imprimir
            </button>
          </div>
        </div>

        {displayedReport && (
          <p className="report-print-filters">
            <strong>Filtros aplicados</strong>
            {hasFilters ? (
              <>
                {filters.de && <span>De: {formatDate(filters.de)}</span>}
                {filters.ate && <span>Até: {formatDate(filters.ate)}</span>}
                {filters.setor?.trim() && <span>Setor: {filters.setor.trim()}</span>}
                {filters.tipo && <span>Tipo de problema: {tipoProblemaLabels[filters.tipo]}</span>}
                {filters.status && <span>Status: {statusLabels[filters.status]}</span>}
              </>
            ) : (
              <span>Nenhum filtro aplicado</span>
            )}
          </p>
        )}

        <ReportFiltersForm
          applied={filters}
          onApply={applyFilters}
          onClear={clearFilters}
        />

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
        ) : !displayedReport ? (
          <div className="asset-empty" role="status">
            {hasFilters ? (
              <>
                <p>
                  Nenhum dado encontrado para os filtros selecionados.
                </p>
                <button
                  className="text-action"
                  onClick={clearFilters}
                  type="button"
                >
                  Limpar filtros
                </button>
              </>
            ) : (
              <p>
                Ainda não há solicitações registradas. O painel será preenchido
                quando houver chamados.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="report-summary-grid">
              <article className="report-card report-total">
                <span className="report-card-label">Total de solicitações</span>
                <strong>{displayedReport.total}</strong>
                <span className="report-card-note">
                  Chamados registrados no sistema
                </span>
              </article>

              <article className="report-card report-average">
                <span className="report-card-label">
                  Tempo médio até conclusão
                </span>
                <strong>{formatReportAverage(displayedReport.averageResolutionHours)}</strong>
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
                    <strong>{displayedReport.byStatus[card.key]}</strong>
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

              {displayedReport.topAssets.length === 0 ? (
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
                      {displayedReport.topAssets.map((entry, index) => (
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
