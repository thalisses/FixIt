import { useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/assets.css";

interface AppShellProps {
  activePath: string;
  children: ReactNode;
  onLoggedOut(): void;
  onNavigate(path: string): void;
}

const roleLabels = {
  CLIENTE: "Cliente",
  MANUTENTOR: "Manutentor",
  GESTOR: "Gestor",
};

export function AppShell({
  activePath,
  children,
  onLoggedOut,
  onNavigate,
}: AppShellProps) {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!user) {
    return null;
  }

  const links = [
    { path: "/", label: "Início" },
    { path: "/assets", label: "Patrimônio" },
    ...(user.role === "GESTOR"
      ? [{ path: "/users", label: "Usuários" }]
      : []),
  ];

  async function handleLogout() {
    setErrorMessage("");
    setIsLoggingOut(true);
    try {
      await logout();
      onLoggedOut();
    } catch {
      setErrorMessage("Não foi possível encerrar a sessão. Tente novamente.");
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <a className="auth-brand" href="/" aria-label="FixIt início">
          <span className="auth-brand-mark" aria-hidden="true">
            F
          </span>
          <span className="auth-brand-name">
            Fix<span>It</span>
          </span>
        </a>
        <nav aria-label="Navegação principal" className="app-nav">
          {links.map((link) => (
            <button
              aria-current={activePath === link.path ? "page" : undefined}
              className="app-nav-link"
              key={link.path}
              onClick={() => onNavigate(link.path)}
              type="button"
            >
              {link.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="app-content">
        <header className="app-topbar">
          <div className="app-user">
            <strong>{user.fullName}</strong>
            <span className={`role-badge role-${user.role.toLowerCase()}`}>
              {roleLabels[user.role]}
            </span>
          </div>
          <button
            className="text-action"
            disabled={isLoggingOut}
            onClick={handleLogout}
            type="button"
          >
            {isLoggingOut ? "Encerrando..." : "Sair"}
          </button>
        </header>
        {errorMessage && (
          <p className="form-error app-shell-error" role="alert">
            {errorMessage}
          </p>
        )}
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
