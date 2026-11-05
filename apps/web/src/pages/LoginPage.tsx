import { useState, type FormEvent } from "react";
import { SessionApiError } from "../lib/authApi";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await login(email, password, rememberMe);
    } catch (error) {
      setErrorMessage(
        error instanceof SessionApiError && error.status === 401
          ? "E-mail ou senha inválidos."
          : "Não foi possível entrar. Verifique sua conexão e tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <a className="auth-brand" href="/" aria-label="FixIt início">
          <span className="auth-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path
                d="M12 11v18m0-16h12m-12 7.5h9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="26" cy="12" r="2.5" fill="#38bdf8" />
              <path
                d="m19 25 7 6m0-6-7 6"
                stroke="#38bdf8"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="auth-brand-name">
            Fix<span>It</span>
          </span>
        </a>
        <p className="auth-header-prompt">
          Ainda não tem conta? <a href="/register">Criar conta</a>
        </p>
      </header>

      <main className="auth-layout">
        <aside className="auth-context" aria-labelledby="login-context-title">
          <h2 id="login-context-title">
            Gestão de manutenção simples e eficiente para sua organização.
          </h2>
          <p className="context-description">
            O FixIt conecta equipes às operações de manutenção da organização.
            Registre solicitações, acompanhe cada etapa e mantenha informações
            sobre seus ativos em um só lugar.
          </p>
          <ul className="context-facts">
            <li>
              <span className="context-fact-mark" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Solicitações Simplificadas</strong>
                <small>
                  Registre problemas com as informações necessárias para
                  agilizar o atendimento.
                </small>
              </span>
            </li>
            <li>
              <span className="context-fact-mark" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Acompanhamento Transparente</strong>
                <small>
                  Consulte o andamento e o histórico de cada solicitação.
                </small>
              </span>
            </li>
            <li>
              <span className="context-fact-mark" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Gestão de Ativos</strong>
                <small>
                  Organize a manutenção e ajude a manter os ativos em
                  funcionamento.
                </small>
              </span>
            </li>
          </ul>
        </aside>

        <section className="registration-panel" aria-labelledby="login-title">
          <div className="form-heading">
            <h1 id="login-title">Entrar no FixIt</h1>
            <p>Entre com suas credenciais de acesso.</p>
          </div>

          <form
            className="login-form"
            onSubmit={submitLogin}
            aria-busy={isSubmitting}
          >
            <label className="form-field">
              <span>
                E-mail <span className="required-mark">(obrigatório)</span>
              </span>
              <input
                autoComplete="email"
                maxLength={320}
                name="email"
                onChange={(event) => {
                  setEmail(event.currentTarget.value);
                  setErrorMessage("");
                }}
                placeholder="voce@exemplo.com"
                required
                type="email"
                value={email}
              />
            </label>

            <div className="form-field">
              <label htmlFor="login-password">
                Senha <span className="required-mark">(obrigatório)</span>
              </label>
              <input
                autoComplete="current-password"
                id="login-password"
                name="password"
                onChange={(event) => {
                  setPassword(event.currentTarget.value);
                  setErrorMessage("");
                }}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="visibility-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? "Ocultar senha" : "Mostrar senha"}
              </button>
            </div>

            <label className="remember-option">
              <input
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>Manter conectado por até 7 dias</span>
            </label>

            {errorMessage && (
              <p className="form-error" role="alert">
                {errorMessage}
              </p>
            )}

            <button
              className="primary-action"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Validando..." : "Entrar"}
            </button>
          </form>

          <p className="login-register-link">
            Não tem acesso? <a href="/register">Cadastre-se</a>
          </p>
        </section>
      </main>

      <footer className="auth-footer">
        <span>FixIt · Gestão de manutenção patrimonial</span>
        <span>Universidade Estadual de Maringá</span>
      </footer>
    </div>
  );
}
