import { useCallback, useEffect, useState } from "react";
import type { StatusSolicitacao } from "../../lib/assetApi";
import {
  listSolicitationHistory,
  SolicitationApiError,
  type SolicitationHistoryEntry,
  type TipoRegistro,
} from "../../lib/solicitationApi";
import { useAuth } from "../../context/AuthContext";
import { StatusBadge } from "../assets/assetPresentation";
import { SolicitationObservationForm } from "./SolicitationObservationForm";
import { formatDateTime } from "./solicitationPresentation";

const recordTitles: Record<TipoRegistro, string> = {
  ABERTURA: "Solicitação aberta",
  MUDANCA_STATUS: "Status alterado",
  ATRIBUICAO: "Responsável atribuído",
  OBSERVACAO: "Observação de execução",
  CANCELAMENTO: "Solicitação cancelada",
};

interface SolicitationTimelineProps {
  solicitationId: number;
  status: StatusSolicitacao;
  responsavelId: string | null;
}

/** Linha do tempo da solicitação (US018) e observações (US017), só para a equipe. */
export function SolicitationTimeline(props: SolicitationTimelineProps) {
  const { user } = useAuth();

  if (!user || user.role === "CLIENTE") {
    return null;
  }

  return <Timeline {...props} currentUserId={user.id} />;
}

function Timeline({
  solicitationId,
  status,
  responsavelId,
  currentUserId,
}: SolicitationTimelineProps & { currentUserId: string }) {
  const { refresh } = useAuth();
  const [entries, setEntries] = useState<SolicitationHistoryEntry[]>([]);
  const [reloadCount, setReloadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const handleRequestError = useCallback(
    (error: unknown): string => {
      if (error instanceof SolicitationApiError && error.status === 401) {
        void refresh();
        return "Sua sessão expirou. Entre novamente.";
      }
      if (error instanceof SolicitationApiError) {
        return error.message;
      }
      return "Não foi possível conectar ao servidor. Tente novamente.";
    },
    [refresh],
  );

  // O status entra nas dependências porque cada mudança gera um registro novo.
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage("");
    void listSolicitationHistory(solicitationId)
      .then((result) => {
        if (isCurrent) {
          setEntries(result);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setErrorMessage(handleRequestError(error));
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
  }, [solicitationId, status, reloadCount, handleRequestError]);

  const canObserve =
    responsavelId === currentUserId &&
    status !== "CONCLUIDO" &&
    status !== "CANCELADA";

  return (
    <section className="asset-card" aria-labelledby="solicitation-history-title">
      <h2 id="solicitation-history-title">Histórico da solicitação</h2>
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
      ) : isLoading && entries.length === 0 ? (
        <p className="asset-muted" role="status" aria-busy="true">
          Carregando histórico...
        </p>
      ) : entries.length === 0 ? (
        <p className="asset-muted" role="status">
          Nenhum registro no histórico desta solicitação.
        </p>
      ) : (
        <ol className="solicitation-timeline">
          {entries.map((entry) => (
            <TimelineItem entry={entry} key={entry.id} />
          ))}
        </ol>
      )}

      {canObserve && (
        <SolicitationObservationForm
          onAdded={(entry) => setEntries((current) => [...current, entry])}
          onRequestError={handleRequestError}
          solicitationId={solicitationId}
        />
      )}
    </section>
  );
}

function TimelineItem({ entry }: { entry: SolicitationHistoryEntry }) {
  const { tipo, statusAnterior, statusNovo, descricao, dataHora, autor } = entry;

  return (
    <li className="solicitation-timeline-item" data-tipo={tipo}>
      <div className="solicitation-timeline-heading">
        <strong>{recordTitles[tipo]}</strong>
        <time dateTime={dataHora}>{formatDateTime(dataHora)}</time>
      </div>
      {statusNovo && (
        <p className="solicitation-timeline-status">
          {statusAnterior && (
            <>
              <StatusBadge status={statusAnterior} />
              <span aria-label="para" role="img">
                →
              </span>
            </>
          )}
          <StatusBadge status={statusNovo} />
        </p>
      )}
      {descricao && <p className="solicitation-description">{descricao}</p>}
      <p className="solicitation-timeline-author">por {autor.fullName}</p>
    </li>
  );
}
