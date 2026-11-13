import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  getTriageCount,
  SolicitationApiError,
} from "../../lib/solicitationApi";

interface TriageCardProps {
  onShowQueue(): void;
}

export function TriageCard({ onShowQueue }: TriageCardProps) {
  const { refresh } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  const handleError = useCallback(
    (error: unknown): string => {
      if (error instanceof SolicitationApiError && error.status === 401) {
        void refresh();
        return "Sua sessão expirou. Entre novamente.";
      }
      if (error instanceof SolicitationApiError) {
        return error.message;
      }
      return "Não foi possível carregar a triagem.";
    },
    [refresh],
  );

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage("");

    void getTriageCount()
      .then((result) => {
        if (isCurrent) {
          setCount(result);
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
    <section
      aria-label="Triagem de solicitações"
      className="solicitation-triage-card"
    >
      <div className="solicitation-triage-text">
        <p className="solicitation-triage-kicker">Triagem</p>
        <h2>Fila aguardando responsável</h2>
        {errorMessage ? (
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
        ) : isLoading || count === null ? (
          <p className="asset-muted" role="status" aria-busy="true">
            Carregando triagem...
          </p>
        ) : count === 0 ? (
          <p className="asset-muted" role="status">
            Nenhum chamado aguardando triagem.
          </p>
        ) : (
          <p className="solicitation-triage-message" role="status">
            <strong>{count}</strong>{" "}
            {count === 1
              ? "solicitação aguardando responsável."
              : "solicitações aguardando responsável."}
          </p>
        )}
      </div>
      {count !== null && count > 0 && !errorMessage && (
        <button
          className="primary-action solicitation-filter-submit"
          onClick={onShowQueue}
          type="button"
        >
          Ver fila
        </button>
      )}
      {errorMessage && (
        <button
          className="text-action"
          onClick={() => setReloadCount((current) => current + 1)}
          type="button"
        >
          Tentar novamente
        </button>
      )}
    </section>
  );
}
