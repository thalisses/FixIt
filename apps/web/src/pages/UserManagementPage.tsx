import { useEffect, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { BackButton } from "../components/BackButton";
import { useAuth } from "../context/AuthContext";
import {
  changeUserRole,
  listUsers,
  UserManagementApiError,
  type ManagedUser,
  type SessionUser,
} from "../lib/authApi";

interface UserManagementPageProps {
  onLoggedOut(): void;
  onNavigate(path: string): void;
}

interface PendingRoleChange {
  userId: string;
  role: SessionUser["role"];
}

const pageSize = 20;

const roleLabels: Record<SessionUser["role"], string> = {
  CLIENTE: "Cliente",
  MANUTENTOR: "Manutentor",
  GESTOR: "Gestor",
};

export function UserManagementPage({
  onLoggedOut,
  onNavigate,
}: UserManagementPageProps) {
  const { user, refresh } = useAuth();
  const currentUserId = user?.id;
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [changingUserId, setChangingUserId] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<
    Record<string, SessionUser["role"] | "">
  >({});
  const [pendingChange, setPendingChange] =
    useState<PendingRoleChange | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let isCurrent = true;
    if (user?.role !== "GESTOR") {
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoading(true);
    setErrorMessage("");
    void listUsers(page, pageSize)
      .then((result) => {
        if (isCurrent) {
          setUsers(result.data);
          setTotalPages(result.pagination.totalPages);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setErrorMessage(getManagementErrorMessage(error));
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
  }, [page, reloadCount, user?.role]);

  useEffect(() => {
    if (pendingChange) {
      confirmButtonRef.current?.focus();
    }
  }, [pendingChange]);

  if (!user || user.role !== "GESTOR") {
    return null;
  }

  function prepareRoleChange(userId: string) {
    const role = selectedRoles[userId];
    if (!role) {
      return;
    }
    setErrorMessage("");
    setSuccessMessage("");
    setPendingChange({ userId, role });
  }

  async function confirmRoleChange() {
    if (!pendingChange) {
      return;
    }

    const { userId, role } = pendingChange;
    setChangingUserId(userId);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const updatedUser = await changeUserRole(userId, role);
      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === updatedUser.id ? updatedUser : currentUser,
        ),
      );
      setSelectedRoles((current) => ({ ...current, [userId]: "" }));
      setPendingChange(null);
      setSuccessMessage(
        `Perfil atualizado para ${roleLabels[updatedUser.role]}.`,
      );
      if (updatedUser.id === currentUserId) {
        await refresh();
      }
    } catch (error) {
      setErrorMessage(getManagementErrorMessage(error));
    } finally {
      setChangingUserId(null);
    }
  }

  return (
    <AppShell
      activePath="/users"
      onLoggedOut={onLoggedOut}
      onNavigate={onNavigate}
    >
      <div className="management-page">
        <BackButton label="Voltar para o Início" onClick={() => onNavigate("/")} />
        <section className="registration-panel" aria-labelledby="users-title">
          <div className="form-heading">
            <p className="context-kicker">Acesso institucional</p>
            <h1 id="users-title">Gerenciar usuários</h1>
            <p>
              Consulte as contas e altere os perfis de acesso da instituição.
            </p>
          </div>

          {errorMessage && (
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
          )}
          {successMessage && (
            <p className="form-success" role="status">
              {successMessage}
            </p>
          )}

          {isLoading ? (
            <div className="management-loading" role="status" aria-busy="true">
              Carregando usuários...
            </div>
          ) : users.length === 0 ? (
            <p className="management-empty" role="status">
              Nenhum usuário encontrado.
            </p>
          ) : (
            <ul className="user-management-list" aria-label="Usuários">
              {users.map((managedUser) => {
                const availableRoles = getAvailableRoles(managedUser.role);
                const isPending = pendingChange?.userId === managedUser.id;
                const isChanging = changingUserId === managedUser.id;

                return (
                  <li className="user-management-row" key={managedUser.id}>
                    <div className="managed-user-details">
                      <strong>{managedUser.fullName}</strong>
                      <span>{managedUser.email}</span>
                      <span>{getInstitutionLabel(managedUser.institutionId)}</span>
                    </div>
                    <span
                      className={`role-badge role-${managedUser.role.toLowerCase()}`}
                    >
                      {roleLabels[managedUser.role]}
                    </span>
                    <div className="managed-user-actions">
                      <label className="management-field">
                        <span>Novo perfil</span>
                        <select
                          aria-label={`Novo perfil para ${managedUser.fullName}`}
                          disabled={isChanging || availableRoles.length === 0}
                          onChange={(event) => {
                            setSelectedRoles((current) => ({
                              ...current,
                              [managedUser.id]: parseSelectedRole(
                                event.target.value,
                              ),
                            }));
                            setPendingChange(null);
                          }}
                          value={selectedRoles[managedUser.id] ?? ""}
                        >
                          <option value="">Selecione</option>
                          {availableRoles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="primary-action role-change-action"
                        disabled={
                          isChanging ||
                          !selectedRoles[managedUser.id] ||
                          availableRoles.length === 0
                        }
                        onClick={() => prepareRoleChange(managedUser.id)}
                        aria-expanded={isPending}
                        type="button"
                      >
                        Alterar perfil
                      </button>
                      {isPending && (
                        <div
                          className="role-confirmation"
                          role="group"
                          aria-label={`Confirmar alteração para ${managedUser.fullName}`}
                        >
                          <p>
                            Alterar {managedUser.fullName} para{" "}
                            {roleLabels[pendingChange.role]}?
                          </p>
                          <button
                            ref={confirmButtonRef}
                            className="text-action"
                            disabled={isChanging}
                            onClick={confirmRoleChange}
                            type="button"
                          >
                            {isChanging ? "Salvando..." : "Confirmar"}
                          </button>
                          <button
                            className="text-action"
                            disabled={isChanging}
                            onClick={() => setPendingChange(null)}
                            type="button"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <nav className="management-pagination" aria-label="Paginação">
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
        </section>
      </div>
    </AppShell>
  );
}

function getAvailableRoles(
  currentRole: SessionUser["role"],
): SessionUser["role"][] {
  switch (currentRole) {
    case "CLIENTE":
      return ["MANUTENTOR", "GESTOR"];
    case "MANUTENTOR":
      return ["GESTOR"];
    case "GESTOR":
      return ["MANUTENTOR"];
  }
}

function parseSelectedRole(value: string): SessionUser["role"] | "" {
  switch (value) {
    case "CLIENTE":
    case "MANUTENTOR":
    case "GESTOR":
      return value;
    default:
      return "";
  }
}

function getInstitutionLabel(institutionId: string): string {
  return institutionId === "UEM"
    ? "Universidade Estadual de Maringá - UEM"
    : institutionId;
}

function getManagementErrorMessage(error: unknown): string {
  if (error instanceof UserManagementApiError) {
    if (error.code === "LAST_MANAGER_REQUIRED") {
      return "Não é possível remover o último Gestor ativo.";
    }
    if (error.status === 401) {
      return "Sua sessão expirou. Entre novamente para continuar.";
    }
    return error.message;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}
