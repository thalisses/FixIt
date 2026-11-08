import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import {
  emptySolicitationFilters,
  SolicitationFiltersForm,
} from "../components/solicitations/SolicitationFilters";
import { SolicitationDetail } from "../components/solicitations/SolicitationDetail";
import { SolicitationList } from "../components/solicitations/SolicitationList";
import { useAuth } from "../context/AuthContext";
import {
  listSolicitations,
  SolicitationApiError,
  type SolicitationFilters,
  type SolicitationListItem,
} from "../lib/solicitationApi";
import "../styles/solicitations.css";

const pageSize = 20;

interface SolicitationsPageProps {
  path?: string;
  onLoggedOut(): void;
  onNavigate(path: string): void;
}

type SolicitationsRoute = { name: "list" } | { name: "detail"; id: number };

export function parseSolicitationsRoute(path: string): SolicitationsRoute {
  const match = /^\/solicitations\/(\d+)$/.exec(path);
  return match ? { name: "detail", id: Number(match[1]) } : { name: "list" };
}

export function SolicitationsPage({
  path = "/solicitations",
  onLoggedOut,
  onNavigate,
}: SolicitationsPageProps) {
  const { user, refresh } = useAuth();
  const route = parseSolicitationsRoute(path);
  const detailId = route.name === "detail" ? route.id : null;
  const [filters, setFilters] = useState<SolicitationFilters>(
    emptySolicitationFilters,
  );
  const [page, setPage] = useState(1);
  const [solicitations, setSolicitations] = useState<SolicitationListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
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

  useEffect(() => {
    if (detailId !== null) {
      setIsLoading(false);
      setErrorMessage("");
      return undefined;
    }

    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage("");

    void listSolicitations({ ...filters, page, pageSize })
      .then((result) => {
        if (!isCurrent) {
          return;
        }
        setSolicitations(result.data);
        setTotalItems(result.pagination.totalItems);
        setTotalPages(result.pagination.totalPages);
        if (
          result.pagination.totalPages > 0 &&
          page > result.pagination.totalPages
        ) {
          setPage(result.pagination.totalPages);
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
  }, [detailId, filters, page, reloadCount, handleRequestError]);

  if (!user) {
    return null;
  }

  const isGestor = user.role === "GESTOR";
  const hasFilters = Boolean(
    filters.status ||
      filters.setor?.trim() ||
      filters.tipo ||
      filters.prioridade ||
      filters.de ||
      filters.ate ||
      filters.semResponsavel,
  );

  function applyFilters(nextFilters: SolicitationFilters) {
    setFilters(nextFilters);
    setPage(1);
  }

  function clearFilters() {
    setFilters(emptySolicitationFilters);
    setPage(1);
  }

  if (route.name === "detail") {
    return (
      <AppShell
        activePath={path}
        onLoggedOut={onLoggedOut}
        onNavigate={onNavigate}
      >
        <SolicitationDetail
          id={route.id}
          onBack={() => onNavigate("/solicitations")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      activePath={path}
      onLoggedOut={onLoggedOut}
      onNavigate={onNavigate}
    >
      <section className="asset-page" aria-labelledby="solicitations-title">
        <div className="asset-page-heading">
          <div>
            <h1 id="solicitations-title">Solicitações</h1>
            <p>
              {isGestor
                ? "Acompanhe a fila, filtre os chamados e organize o atendimento."
                : "Acompanhe as solicitações disponíveis para o seu perfil."}
            </p>
          </div>
          <div className="solicitation-count" aria-live="polite">
            <strong>{totalItems}</strong>
            <span>{totalItems === 1 ? "registro" : "registros"}</span>
          </div>
        </div>

        <SolicitationFiltersForm
          applied={filters}
          onApply={applyFilters}
          onClear={clearFilters}
          showUnassigned={isGestor}
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
            Carregando solicitações...
          </div>
        ) : solicitations.length === 0 ? (
          <div className="asset-empty" role="status">
            {hasFilters ? (
              <>
                <p>
                  Nenhuma solicitação encontrada para os filtros selecionados.
                </p>
                <button
                  className="text-action"
                  onClick={clearFilters}
                  type="button"
                >
                  Limpar filtros e ver todas
                </button>
              </>
            ) : (
              <p>Nenhuma solicitação registrada ainda.</p>
            )}
          </div>
        ) : (
          <>
            <SolicitationList
              onOpen={(id) => onNavigate(`/solicitations/${id}`)}
              solicitations={solicitations}
            />

            <nav
              aria-label="Paginação das solicitações"
              className="solicitation-pagination"
            >
              <button
                className="text-action"
                disabled={isLoading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Página anterior
              </button>
              <span>
                Página {page} de {totalPages || 1}
              </span>
              <button
                className="text-action"
                disabled={isLoading || page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Próxima página
              </button>
            </nav>
          </>
        )}
      </section>
    </AppShell>
  );
}
