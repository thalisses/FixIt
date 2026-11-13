import { useCallback, useEffect, useState } from "react";
import type { StatusSolicitacao } from "../../lib/assetApi";
import {
  getSolicitation,
  assignSolicitationMaintainer,
  cancelSolicitation,
  changeSolicitationPriority,
  changeSolicitationStatus,
  listSolicitationMaintainers,
  SolicitationApiError,
  type MaintainerCandidate,
  type NivelPrioridade,
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
  priorityLabels,
  PriorityBadge,
  UrgencyBadge,
} from "./solicitationPresentation";
import { SolicitationTimeline } from "./SolicitationTimeline";

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
  const [priorityDraft, setPriorityDraft] = useState<NivelPrioridade | "">("");
  const [isSavingPriority, setIsSavingPriority] = useState(false);
  const [priorityMessage, setPriorityMessage] = useState("");
  const [priorityError, setPriorityError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [maintainers, setMaintainers] = useState<MaintainerCandidate[]>([]);
  const [selectedMaintainerId, setSelectedMaintainerId] = useState("");
  const [isLoadingMaintainers, setIsLoadingMaintainers] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [isCanceling, setIsCanceling] = useState(false);
  const [isCancelConfirmationOpen, setIsCancelConfirmationOpen] =
    useState(false);
  const [cancelError, setCancelError] = useState("");

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

  useEffect(() => {
    setPriorityDraft(solicitation?.prioridade ?? "");
  }, [solicitation?.prioridade]);

  useEffect(() => {
    setSelectedMaintainerId(solicitation?.responsavel?.id ?? "");
  }, [solicitation?.responsavel?.id]);

  useEffect(() => {
    if (user?.role !== "GESTOR") {
      setMaintainers([]);
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingMaintainers(true);
    setAssignmentError("");
    void listSolicitationMaintainers(id)
      .then((result) => {
        if (isCurrent) {
          setMaintainers(result);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setAssignmentError(handleRequestError(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingMaintainers(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [id, reloadCount, user?.role, handleRequestError]);

  if (!user) {
    return null;
  }

  const canManage = user.role === "GESTOR";
  const canUpdate =
    Boolean(solicitation) &&
    (user.role === "GESTOR" ||
      (user.role === "MANUTENTOR" &&
        solicitation?.responsavel?.id === user.id));
  const nextStatus = solicitation ? nextStatusOf(solicitation.status) : null;

  async function savePriority() {
    if (!priorityDraft) {
      return;
    }

    setIsSavingPriority(true);
    setPriorityMessage("");
    setPriorityError("");
    try {
      const updated = await changeSolicitationPriority(id, priorityDraft);
      setSolicitation(updated);
      setPriorityMessage("Prioridade atualizada.");
    } catch (error) {
      setPriorityError(handleRequestError(error));
    } finally {
      setIsSavingPriority(false);
    }
  }

  async function saveAssignment() {
    if (!selectedMaintainerId) {
      return;
    }
    setIsAssigning(true);
    setAssignmentMessage("");
    setAssignmentError("");
    try {
      const updated = await assignSolicitationMaintainer(
        id,
        selectedMaintainerId,
      );
      setSolicitation(updated);
      setAssignmentMessage("Responsável atualizado.");
    } catch (error) {
      setAssignmentError(handleRequestError(error));
    } finally {
      setIsAssigning(false);
    }
  }

  async function confirmCancel() {
    if (!cancelReason.trim()) {
      setCancelError("Informe o motivo do cancelamento.");
      return;
    }

    setIsCanceling(true);
    setCancelError("");
    setSuccessMessage("");
    try {
      const updated = await cancelSolicitation(id, cancelReason.trim());
      setSolicitation(updated);
      setCancelReason("");
      setIsCancelConfirmationOpen(false);
      setSuccessMessage("Solicitação cancelada.");
    } catch (error) {
      setCancelError(handleRequestError(error));
      setIsCancelConfirmationOpen(false);
    } finally {
      setIsCanceling(false);
    }
  }

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

          {canManage && (
            <div className="asset-card">
              <h2>Prioridade de atendimento</h2>
              <p className="asset-muted">
                A urgência é declarada pelo solicitante. A prioridade é uma
                decisão do Gestor e define a ordem da fila.
              </p>
              <div className="solicitation-priority-form">
                <label className="form-field">
                  <span>Prioridade</span>
                  <select
                    name="prioridade"
                    onChange={(event) => {
                      setPriorityDraft(
                        event.target.value as NivelPrioridade | "",
                      );
                      setPriorityMessage("");
                      setPriorityError("");
                    }}
                    value={priorityDraft}
                  >
                    <option value="">Selecione</option>
                    {(["ALTA", "MEDIA", "BAIXA"] as const).map((priority) => (
                      <option key={priority} value={priority}>
                        {priorityLabels[priority]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-action solicitation-action-button"
                  disabled={
                    !priorityDraft ||
                    isSavingPriority ||
                    priorityDraft === solicitation.prioridade
                  }
                  onClick={savePriority}
                  type="button"
                >
                  {isSavingPriority ? "Salvando..." : "Salvar prioridade"}
                </button>
              </div>
              {priorityMessage && (
                <p className="form-success" role="status">
                  {priorityMessage}
                </p>
              )}
              {priorityError && (
                <p className="form-error" role="alert">
                  {priorityError}
                </p>
              )}
            </div>
          )}

          {canManage && (
            <div className="asset-card">
              <h2>Responsável pela solicitação</h2>
              <p className="asset-muted">
                Todos os manutentores ativos são listados; os compatíveis com
                {` ${tipoProblemaLabels[solicitation.tipoProblema].toLowerCase()}`}
                aparecem primeiro.
              </p>
              {isLoadingMaintainers ? (
                <p role="status" aria-busy="true">
                  Carregando manutentores...
                </p>
              ) : maintainers.length === 0 ? (
                <p className="asset-muted">
                  Nenhum manutentor ativo cadastrado.
                </p>
              ) : (
                <div className="solicitation-priority-form">
                  <label className="form-field">
                    <span>Manutentor</span>
                    <select
                      aria-label="Manutentor responsável"
                      disabled={isAssigning}
                      onChange={(event) => {
                        setSelectedMaintainerId(event.target.value);
                        setAssignmentMessage("");
                        setAssignmentError("");
                      }}
                      value={selectedMaintainerId}
                    >
                      <option value="">Selecione</option>
                      {maintainers.map((maintainer) => (
                        <option key={maintainer.id} value={maintainer.id}>
                          {maintainer.fullName} ·{" "}
                          {maintainer.specialty
                            ? tipoProblemaLabels[maintainer.specialty]
                            : "Especialidade pendente"}
                          {maintainer.specialty === solicitation.tipoProblema
                            ? " · Compatível"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary-action solicitation-action-button"
                    disabled={
                      !selectedMaintainerId ||
                      selectedMaintainerId === solicitation.responsavel?.id ||
                      isAssigning
                    }
                    onClick={saveAssignment}
                    type="button"
                  >
                    {isAssigning ? "Salvando..." : "Atribuir Manutentor"}
                  </button>
                </div>
              )}
              {assignmentMessage && (
                <p className="form-success" role="status">
                  {assignmentMessage}
                </p>
              )}
              {assignmentError && (
                <p className="form-error" role="alert">
                  {assignmentError}
                </p>
              )}
            </div>
          )}

          {canManage && solicitation.status === "EM_ABERTO" && (
            <div className="asset-card solicitation-cancel-card">
              <h2>Cancelar solicitação</h2>
              <p className="asset-muted">
                O cancelamento mantém o registro no histórico e retira a
                solicitação da fila de atendimento.
              </p>
              {isCancelConfirmationOpen ? (
                <div
                  aria-label="Confirmar cancelamento"
                  className="solicitation-cancel-confirmation"
                  role="group"
                >
                  <p>
                    Confirmar o cancelamento desta solicitação? Esta ação não
                    apaga o histórico.
                  </p>
                  <button
                    className="primary-action solicitation-action-button"
                    disabled={isCanceling}
                    onClick={confirmCancel}
                    type="button"
                  >
                    {isCanceling ? "Cancelando..." : "Confirmar cancelamento"}
                  </button>
                  <button
                    className="text-action"
                    disabled={isCanceling}
                    onClick={() => setIsCancelConfirmationOpen(false)}
                    type="button"
                  >
                    Voltar
                  </button>
                </div>
              ) : (
                <div className="solicitation-cancel-form">
                  <label className="form-field">
                    <span>Motivo do cancelamento</span>
                    <textarea
                      disabled={isCanceling}
                      name="motivo"
                      onChange={(event) => {
                        setCancelReason(event.target.value);
                        setCancelError("");
                      }}
                      placeholder="Ex.: chamado duplicado"
                      rows={3}
                      value={cancelReason}
                    />
                  </label>
                  <button
                    className="primary-action solicitation-action-button"
                    disabled={!cancelReason.trim() || isCanceling}
                    onClick={() => setIsCancelConfirmationOpen(true)}
                    type="button"
                  >
                    Cancelar solicitação
                  </button>
                </div>
              )}
              {cancelError && (
                <p className="form-error" role="alert">
                  {cancelError}
                </p>
              )}
            </div>
          )}

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

          <SolicitationTimeline
            responsavelId={solicitation.responsavel?.id ?? null}
            solicitationId={id}
            status={solicitation.status}
          />
        </>
      )}
    </section>
  );
}
