import { useCallback, useEffect, useState } from "react";
import type { StatusSolicitacao } from "../../lib/assetApi";
import {
  getSolicitation,
  changeSolicitationStatus,
  SolicitationApiError,
  type SolicitationDetail,
} from "../../lib/solicitationApi";
import { useAuth } from "../../context/AuthContext";
import { BackButton } from "../BackButton";
import {
  formatDay,
  StatusBadge,
  tipoProblemaLabels,
} from "../assets/assetPresentation";
import {
  formatDateTime,
  formatProtocol,
  PriorityBadge,
  UrgencyBadge,
} from "./solicitationPresentation";

interface SolicitationDetailProps {
  id: number;
  onBack(): void;
}

function nextStatusOf(
  status: StatusSolicitacao,
): { status: StatusSolicitacao; label: string } | null {
  if (status === "EM_ABERTO") {
    return { status: "EM_ATENDIMENTO", label: "Iniciar atendimento" };
  }
  if (status === "EM_ATENDIMENTO") {
    return { status: "CONCLUIDO", label: "Concluir solicitação" };
  }
  return null;
}

export function SolicitationDetail({
  id,
  onBack,
}: SolicitationDetailProps) {
  const { user, refresh } = useAuth();
  const [solicitation, setSolicitation] = useState<SolicitationDetail | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingStatus, setPendingStatus] = useState<StatusSolicitacao | null>(
    null,
  );
  const [reloadCount, setReloadCount] = useState(0);

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
    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage("");

    void getSolicitation(id)
      .then((result) => {
        if (isCurrent) {
          setSolicitation(result);
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
  }, [id, reloadCount, handleRequestError]);

  if (!user) {
    return null;
  }

  const canUpdate =
    Boolean(solicitation) &&
    (user.role === "GESTOR" ||
      (user.role === "MANUTENTOR" &&
        solicitation?.responsavel?.id === user.id));
  const nextStatus = solicitation ? nextStatusOf(solicitation.status) : null;

  async function confirmStatusChange() {
    if (!pendingStatus) {
      return;
    }

    setIsUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const updated = await changeSolicitationStatus(id, pendingStatus);
      setSolicitation(updated);
      setPendingStatus(null);
      setSuccessMessage(
        pendingStatus === "CONCLUIDO"
          ? "Solicitação concluída."
          : "Atendimento iniciado.",
      );
    } catch (error) {
      setErrorMessage(handleRequestError(error));
      setPendingStatus(null);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <section className="asset-page" aria-labelledby="solicitation-detail-title">
      <BackButton label="Voltar para Solicitações" onClick={onBack} />

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
      ) : isLoading || !solicitation ? (
        <div className="asset-loading" role="status" aria-busy="true">
          Carregando solicitação...
        </div>
      ) : (
        <>
          <nav aria-label="Caminho" className="asset-breadcrumb">
            <button className="asset-link" onClick={onBack} type="button">
              Solicitações
            </button>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{formatProtocol(solicitation)}</span>
          </nav>

          <div className="asset-page-heading">
            <div>
              <p className="solicitation-protocol">
                {formatProtocol(solicitation)}
              </p>
              <h1 id="solicitation-detail-title">{solicitation.local}</h1>
              <p className="solicitation-detail-subtitle">
                {tipoProblemaLabels[solicitation.tipoProblema]}
                {solicitation.setorResponsavel
                  ? ` · ${solicitation.setorResponsavel}`
                  : ""}
                {" · "}
                Aberta em {formatDay(solicitation.data)}
              </p>
            </div>
            <StatusBadge status={solicitation.status} />
          </div>

          {successMessage && (
            <p className="form-success" role="status">
              {successMessage}
            </p>
          )}

          <div className="asset-detail-grid">
            <div className="asset-card">
              <h2>Descrição do problema</h2>
              <p className="solicitation-description">
                {solicitation.descricaoProblema}
              </p>
              {solicitation.observacoes && (
                <>
                  <h2>Observações</h2>
                  <p className="solicitation-description">
                    {solicitation.observacoes}
                  </p>
                </>
              )}
            </div>

            <div className="asset-card">
              <h2>Dados da solicitação</h2>
              <dl className="asset-facts">
                <div>
                  <dt>Solicitante</dt>
                  <dd>{solicitation.solicitante?.fullName ?? "Não informado"}</dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>
                    {solicitation.responsavel?.fullName ?? "Não atribuído"}
                  </dd>
                </div>
                <div>
                  <dt>Abertura</dt>
                  <dd>{formatDateTime(solicitation.data)}</dd>
                </div>
                <div>
                  <dt>Conclusão</dt>
                  <dd>
                    {solicitation.dataConclusao
                      ? formatDateTime(solicitation.dataConclusao)
                      : "Ainda não concluída"}
                  </dd>
                </div>
                <div>
                  <dt>Urgência declarada</dt>
                  <dd>
                    <UrgencyBadge urgency={solicitation.urgencia} />
                  </dd>
                </div>
                <div>
                  <dt>Prioridade de atendimento</dt>
                  <dd>
                    <PriorityBadge priority={solicitation.prioridade} />
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="asset-card">
            <h2>Bem vinculado</h2>
            {solicitation.bem ? (
              <p className="solicitation-asset-detail">
                <span className="asset-code">
                  {solicitation.bem.codigoPatrimonial}
                </span>
                <span>{solicitation.bem.descricao}</span>
              </p>
            ) : (
              <p className="asset-muted">
                Esta solicitação não está vinculada a um bem patrimonial.
              </p>
            )}
          </div>

          {canUpdate && nextStatus && (
            <div className="asset-card solicitation-action-card">
              <div>
                <h2>Ação de atendimento</h2>
                <p className="asset-muted">
                  {nextStatus.label} e registrar a alteração no histórico.
                </p>
              </div>
              {pendingStatus ? (
                <div
                  aria-label="Confirmar mudança de status"
                  className="solicitation-confirmation"
                  role="group"
                >
                  <p>Confirmar a mudança para {nextStatus.label.toLowerCase()}?</p>
                  <button
                    className="primary-action solicitation-action-button"
                    disabled={isUpdating}
                    onClick={confirmStatusChange}
                    type="button"
                  >
                    {isUpdating ? "Salvando..." : "Confirmar"}
                  </button>
                  <button
                    className="text-action"
                    disabled={isUpdating}
                    onClick={() => setPendingStatus(null)}
                    type="button"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  className="primary-action solicitation-action-button"
                  onClick={() => setPendingStatus(nextStatus.status)}
                  type="button"
                >
                  {nextStatus.label}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
