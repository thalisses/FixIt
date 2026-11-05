import { useState } from "react";
import { useAuth } from "../context/AuthContext";

interface AuthenticatedPageProps {
  onLoggedOut(): void;
  onManageUsers(): void;
}

const roleLabels = {
  CLIENTE: "Cliente",
  MANUTENTOR: "Manutentor",
  GESTOR: "Gestor",
};

export function AuthenticatedPage({
  onLoggedOut,
  onManageUsers,
}: AuthenticatedPageProps) {
  const { user, logout } = useAuth();
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) {
    return null;
  }

  async function handleLogout() {
    setErrorMessage("");
    setIsLoggingOut(true);
    try {
      await logout();
      onLoggedOut();
    } catch {
      setErrorMessage("Não foi possível encerrar a sessão. Tente novamente.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <a className="auth-brand" href="/" aria-label="FixIt início">
          <span className="auth-brand-mark" aria-hidden="true">
            F
          </span>
          <span className="auth-brand-name">
            Fix<span>It</span>
          </span>
        </a>
        <div className="management-header-actions">
          {user.role === "GESTOR" && (
            <button
              className="text-action"
              onClick={onManageUsers}
              type="button"
            >
              Administrar usuários
            </button>
          )}
          <button
            className="text-action"
            disabled={isLoggingOut}
            onClick={handleLogout}
            type="button"
          >
            {isLoggingOut ? "Encerrando..." : "Sair"}
          </button>
        </div>
      </header>
      <main className="auth-layout authenticated-layout">
        <section className="registration-panel" aria-labelledby="welcome-title">
          <p className="context-kicker">Sessão ativa</p>
          <h1 id="welcome-title">Olá, {user.fullName}</h1>
          <p className="authenticated-copy">
            Você entrou como <strong>{roleLabels[user.role]}</strong> usando{" "}
            <strong>{user.email}</strong>.
          </p>
          <p className="authenticated-copy">
            As próximas áreas disponíveis serão definidas pelo seu perfil.
          </p>
          {errorMessage && (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          )}
        </section>
      </main>
      <footer className="auth-footer">
        <span>FixIt · Gestão de manutenção patrimonial</span>
        <span>Universidade Estadual de Maringá</span>
      </footer>
    </div>
  );
}
