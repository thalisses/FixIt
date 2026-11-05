import { useEffect, useState } from "react";
import "./styles/index.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AssetsPage } from "./pages/AssetsPage";
import { AuthenticatedPage } from "./pages/AuthenticatedPage";
import { LoginPage } from "./pages/LoginPage";
import { RegistrationPage } from "./pages/RegistrationPage";
import { UserManagementPage } from "./pages/UserManagementPage";

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

  useEffect(() => {
    const updatePath = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
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
          onBack={() => navigate("/")}
          onLoggedOut={() => navigate("/login")}
        />
      );
    }

    if (user.role !== "CLIENTE" && currentPath === "/assets") {
      return (
        <AssetsPage
          onLoggedOut={() => navigate("/login")}
          onNavigate={navigate}
        />
      );
    }

    return (
      <AuthenticatedPage
        onLoggedOut={() => navigate("/login")}
        onManageAssets={() => navigate("/assets")}
        onManageUsers={() => navigate("/users")}
      />
    );
  }

  return ["/login", "/users", "/assets"].includes(currentPath) ? (
    <LoginPage />
  ) : (
    <RegistrationPage />
  );
}