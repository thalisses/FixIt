import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useAuth } from "../context/AuthContext";
import type { SessionUser } from "../lib/authApi";
import "../styles/layout.css";
import {
  AssetIcon,
  CloseIcon,
  HomeIcon,
  LogoutIcon,
  MenuIcon,
  SolicitationIcon,
  UsersIcon,
} from "./icons";

interface AppShellProps {
  activePath: string;
  children: ReactNode;
  onLoggedOut(): void;
  onNavigate(path: string): void;
}

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

const roleLabels: Record<SessionUser["role"], string> = {
  CLIENTE: "Cliente",
  MANUTENTOR: "Manutentor",
  GESTOR: "Gestor",
};

// Pausas curtas para o menu não piscar quando o mouse só passa por cima.
const OPEN_DELAY_MS = 80;
const CLOSE_DELAY_MS = 250;

export function navItemsFor(role: SessionUser["role"]): NavItem[] {
  return [
    { path: "/", label: "Início", icon: <HomeIcon /> },
    {
      path: "/solicitations",
      label: "Solicitações",
      icon: <SolicitationIcon />,
    },
    ...(role !== "CLIENTE"
      ? [{ path: "/assets", label: "Patrimônio", icon: <AssetIcon /> }]
      : []),
    ...(role === "GESTOR"
      ? [{ path: "/users", label: "Usuários", icon: <UsersIcon /> }]
      : []),
  ];
}

function sectionOf(path: string): string {
  if (path.startsWith("/solicitations")) {
    return "/solicitations";
  }
  if (path.startsWith("/assets")) {
    return "/assets";
  }
  return path.startsWith("/users") ? "/users" : "/";
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function AppShell({
  activePath,
  children,
  onLoggedOut,
  onNavigate,
}: AppShellProps) {
  const { user, logout } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const hoverTimer = useRef<number | undefined>(undefined);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const currentLabel = user
    ? (navItemsFor(user.role).find(
        (item) => item.path === sectionOf(activePath),
      )?.label ?? "Início")
    : "Início";

  // A aba do navegador também diz onde a pessoa está.
  useEffect(() => {
    document.title = `${currentLabel} | FixIt`;
  }, [currentLabel]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return undefined;
    }
    firstLinkRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isDrawerOpen]);

  if (!user) {
    return null;
  }

  const items = navItemsFor(user.role);
  const currentSection = sectionOf(activePath);

  function scheduleExpanded(next: boolean) {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => setIsExpanded(next),
      next ? OPEN_DELAY_MS : CLOSE_DELAY_MS,
    );
  }

  function go(event: MouseEvent<HTMLAnchorElement>, path: string) {
    // Mantém o Ctrl+clique e o botão do meio abrindo outra aba.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    setIsDrawerOpen(false);
    setIsExpanded(false);
    onNavigate(path);
  }

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
    <div className="app-shell" data-drawer-open={isDrawerOpen || undefined}>
      <a className="app-skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <aside
        aria-label="Menu"
        className="app-sidebar"
        data-expanded={isExpanded || undefined}
        id="app-sidebar"
        onMouseEnter={() => scheduleExpanded(true)}
        onMouseLeave={() => scheduleExpanded(false)}
      >
        <div className="app-sidebar-header">
          <a
            aria-label="FixIt, ir para o Início"
            className="app-brand"
            href="/"
            onClick={(event) => go(event, "/")}
          >
            <span className="auth-brand-mark" aria-hidden="true">
              F
            </span>
            <span className="app-reveal app-brand-name">
              Fix<span>It</span>
            </span>
          </a>
          <button
            aria-label="Fechar menu"
            className="app-drawer-close"
            onClick={() => {
              setIsDrawerOpen(false);
              menuButtonRef.current?.focus();
            }}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <nav aria-label="Navegação principal" className="app-nav">
          {items.map((item, index) => (
            <a
              aria-current={currentSection === item.path ? "page" : undefined}
              className="app-nav-link"
              href={item.path}
              key={item.path}
              onClick={(event) => go(event, item.path)}
              ref={index === 0 ? firstLinkRef : undefined}
              title={item.label}
            >
              {item.icon}
              <span className="app-reveal">{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-user">
            <span className="app-avatar" aria-hidden="true">
              {initialsOf(user.fullName)}
            </span>
            <span className="app-reveal app-user-text">
              <strong>{user.fullName}</strong>
              <span>{roleLabels[user.role]}</span>
            </span>
          </div>
          <button
            className="app-nav-link app-logout"
            disabled={isLoggingOut}
            onClick={handleLogout}
            title="Sair"
            type="button"
          >
            <LogoutIcon />
            <span className="app-reveal">
              {isLoggingOut ? "Encerrando..." : "Sair"}
            </span>
          </button>
        </div>
      </aside>

      <button
        aria-hidden="true"
        className="app-backdrop"
        onClick={() => setIsDrawerOpen(false)}
        tabIndex={-1}
        type="button"
      />

      <div className="app-content">
        <header className="app-topbar">
          <button
            aria-controls="app-sidebar"
            aria-expanded={isDrawerOpen}
            className="app-menu-button"
            onClick={() => setIsDrawerOpen(true)}
            ref={menuButtonRef}
            type="button"
          >
            <MenuIcon />
            Menu
          </button>
          <p className="app-section">{currentLabel}</p>
          <div className="app-topbar-user">
            <span>{user.fullName}</span>
            <span className={`role-badge role-${user.role.toLowerCase()}`}>
              {roleLabels[user.role]}
            </span>
          </div>
        </header>
        {errorMessage && (
          <p className="form-error app-shell-error" role="alert">
            {errorMessage}
          </p>
        )}
        <main className="app-main" id="conteudo" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
