import type { MouseEvent, ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import {
  AssetIcon,
  SolicitationIcon,
  UsersIcon,
} from "../components/icons";
import { useAuth } from "../context/AuthContext";
import type { SessionUser } from "../lib/authApi";

interface AuthenticatedPageProps {
  onLoggedOut(): void;
  onNavigate(path: string): void;
}

interface Shortcut {
  path: string;
  title: string;
  description: string;
  icon: ReactNode;
}

const roleLabels: Record<SessionUser["role"], string> = {
  CLIENTE: "Cliente",
  MANUTENTOR: "Manutentor",
  GESTOR: "Gestor",
};

function shortcutsFor(role: SessionUser["role"]): Shortcut[] {
  return [
    {
      path: "/solicitations",
      title: "Solicitações",
      description: "Acompanhe a fila e consulte os chamados da instituição.",
      icon: <SolicitationIcon />,
    },
    ...(role !== "CLIENTE"
      ? [
          {
            path: "/assets",
            title: "Patrimônio",
            description: "Consulte, cadastre e edite os bens da instituição.",
            icon: <AssetIcon />,
          },
        ]
      : []),
    ...(role === "GESTOR"
      ? [
          {
            path: "/users",
            title: "Usuários",
            description: "Altere o perfil de acesso das contas.",
            icon: <UsersIcon />,
          },
        ]
      : []),
  ];
}

export function AuthenticatedPage({
  onLoggedOut,
  onNavigate,
}: AuthenticatedPageProps) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const firstName = user.fullName.trim().split(/\s+/)[0];
  const shortcuts = shortcutsFor(user.role);

  function open(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <AppShell activePath="/" onLoggedOut={onLoggedOut} onNavigate={onNavigate}>
      <section className="home-page" aria-labelledby="welcome-title">
        <div className="home-heading">
          <h1 id="welcome-title">Olá, {firstName}</h1>
          <p>
            Você entrou como <strong>{roleLabels[user.role]}</strong> com{" "}
            {user.email}.
          </p>
        </div>

        {shortcuts.length > 0 && (
          <div className="home-group">
            <h2>Acesso rápido</h2>
            <ul className="home-shortcuts">
              {shortcuts.map((shortcut) => (
                <li key={shortcut.path}>
                  <a
                    className="home-shortcut"
                    href={shortcut.path}
                    onClick={(event) => open(event, shortcut.path)}
                  >
                    <span className="home-shortcut-icon">{shortcut.icon}</span>
                    <span className="home-shortcut-text">
                      <strong>{shortcut.title}</strong>
                      <span>{shortcut.description}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {user.role === "CLIENTE" && (
          <p className="home-note">
            A abertura de solicitações de manutenção ainda está em
            desenvolvimento. Quando estiver pronta, ela aparece aqui e no menu.
          </p>
        )}
      </section>
    </AppShell>
  );
}
