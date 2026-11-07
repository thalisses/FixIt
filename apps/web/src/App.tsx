import { useEffect, useRef, useState } from "react";
import "./styles/index.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AssetsPage } from "./pages/AssetsPage";
import { AuthenticatedPage } from "./pages/AuthenticatedPage";
import { LoginPage } from "./pages/LoginPage";
import { RegistrationPage } from "./pages/RegistrationPage";
import { SolicitationsPage } from "./pages/SolicitationsPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { confirmDiscardChanges } from "./lib/unsavedChanges";

function isAssetPath(path: string): boolean {
  return path === "/assets" || path.startsWith("/assets/");
}

/** Endereços que cada cargo pode abrir depois do login. */
function canOpen(role: string, path: string): boolean {
  if (path === "/" || path === "/solicitations") {
    return true;
  }
  if (path === "/users") {
    return role === "GESTOR";
  }
  return role !== "CLIENTE" && isAssetPath(path);
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, isLoading, errorMessage, refresh } = useAuth();
  const [currentPath, setCurrentPath] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );

  const pathRef = useRef(currentPath);
  pathRef.current = currentPath;

  useEffect(() => {
    const updatePath = () => {
      // O voltar do navegador também pergunta antes de descartar alterações.
      if (!confirmDiscardChanges()) {
        window.history.pushState({}, "", pathRef.current);
        return;
      }
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  // Depois do login, ou num endereço que o cargo não abre, o endereço vira o
  // do Início, para a barra do navegador mostrar onde a pessoa está.
  const role = user?.role;
  useEffect(() => {
    if (role && !canOpen(role, currentPath)) {
      window.history.replaceState({}, "", "/");
      setCurrentPath("/");
    }
  }, [role, currentPath]);

  function navigate(path: string) {
    if (path === currentPath || !confirmDiscardChanges()) {
      return;
    }
    window.history.pushState({}, "", path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  }

  if (isLoading) {
    return (
      <main className="auth-loading" role="status" aria-busy="true">
        Verificando sua sessão...
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="auth-loading">
        <p role="alert">{errorMessage}</p>
        <button className="primary-action" onClick={refresh} type="button">
          Tentar novamente
        </button>
      </main>
    );
  }

  if (user) {
    if (user.role === "GESTOR" && currentPath === "/users") {
      return (
        <UserManagementPage
          onLoggedOut={() => navigate("/login")}
          onNavigate={navigate}
        />
      );
    }

    if (user.role !== "CLIENTE" && isAssetPath(currentPath)) {
      return (
        <AssetsPage
          onLoggedOut={() => navigate("/login")}
          onNavigate={navigate}
          path={currentPath}
        />
      );
    }

    if (currentPath === "/solicitations") {
      return (
        <SolicitationsPage
          onLoggedOut={() => navigate("/login")}
          onNavigate={navigate}
        />
      );
    }

    return (
      <AuthenticatedPage
        onLoggedOut={() => navigate("/login")}
        onNavigate={navigate}
      />
    );
  }

  return currentPath === "/login" ||
    currentPath === "/users" ||
    currentPath === "/solicitations" ||
    isAssetPath(currentPath) ? (
    <LoginPage />
  ) : (
    <RegistrationPage />
  );
}