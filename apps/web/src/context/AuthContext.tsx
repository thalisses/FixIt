import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createSession,
  deleteCurrentSession,
  getCurrentSession,
  type SessionUser,
} from "../lib/authApi";

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  errorMessage: string;
  login(email: string, password: string, rememberMe: boolean): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      setUser(await getCurrentSession());
    } catch {
      setUser(null);
      setErrorMessage(
        "Não foi possível verificar sua sessão. Tente novamente.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const authenticatedUser = await createSession(
        email,
        password,
        rememberMe,
      );
      setUser(authenticatedUser);
      setErrorMessage("");
    },
    [],
  );

  const logout = useCallback(async () => {
    await deleteCurrentSession();
    setUser(null);
    setErrorMessage("");
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, errorMessage, login, logout, refresh }),
    [user, isLoading, errorMessage, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
