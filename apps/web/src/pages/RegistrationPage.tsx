import { useEffect, useState, type FormEvent } from "react";
import {
  registerUser,
  RegistrationApiError,
  type RegisterUserInput,
} from "../lib/authApi";

interface RegistrationFields {
  fullName: string;
  cpf: string;
  institutionId: "" | "UEM";
  cityUf: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const initialFields: RegistrationFields = {
  fullName: "",
  cpf: "",
  institutionId: "",
  cityUf: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export function RegistrationPage() {
  const [fields, setFields] = useState(initialFields);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!registered) {
      return;
    }

    const redirectTimer = window.setTimeout(
      () => window.location.assign("/login"),
      1500,
    );
    return () => window.clearTimeout(redirectTimer);
  }, [registered]);

  function updateField<Field extends keyof RegistrationFields>(
    field: Field,
    value: RegistrationFields[Field],
  ) {
    setFields((current) => ({ ...current, [field]: value }));
    setErrorMessage("");
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (fields.institutionId !== "UEM") {
      setErrorMessage("Selecione uma instituição para continuar.");
      return;
    }
    if (fields.password !== fields.confirmPassword) {
      setErrorMessage("As senhas não correspondem.");
      return;
    }
    if (Array.from(fields.password).length < 8) {
      setErrorMessage("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (new TextEncoder().encode(fields.password).length > 72) {
      setErrorMessage("A senha deve ter no máximo 72 bytes em UTF-8.");
      return;
    }

    const input: RegisterUserInput = {
      fullName: fields.fullName,
      email: fields.email,
      password: fields.password,
      institutionId: fields.institutionId,
      ...(fields.cpf.trim() ? { cpf: fields.cpf.trim() } : {}),
      ...(fields.cityUf.trim() ? { cityUf: fields.cityUf.trim() } : {}),
    };

    setIsSubmitting(true);
    try {
      await registerUser(input);
      setRegistered(true);
    } catch (error) {
      if (error instanceof RegistrationApiError) {
        setErrorMessage(
          error.status >= 500
            ? "Não foi possível concluir o cadastro. Tente novamente."
            : error.message,
        );
      } else {
        setErrorMessage(
          "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.",
        );
      }
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
          Já tem cadastro? <a href="/login">Acessar conta</a>
        </p>
      </header>

      <main className="auth-layout">
        <aside className="auth-context" aria-labelledby="context-title">
          <p className="context-kicker">Gestão de manutenção patrimonial</p>
          <h2 id="context-title">
            Cuidar dos espaços começa por um cadastro confiável.
          </h2>
          <p className="context-description">
            O FixIt reúne solicitações de manutenção e informações dos ativos
            em um ambiente institucional.
          </p>
          <ul className="context-facts">
            <li>
              <span className="context-fact-mark" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Vínculo institucional</strong>
                <small>Seu cadastro fica associado à instituição escolhida.</small>
              </span>
            </li>
            <li>
              <span className="context-fact-mark" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Perfil de Cliente</strong>
                <small>Novas contas começam com acesso de Cliente.</small>
              </span>
            </li>
            <li>
              <span className="context-fact-mark" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Senha protegida</strong>
                <small>O sistema armazena somente uma versão criptográfica.</small>
              </span>
            </li>
          </ul>
        </aside>

        <section className="registration-panel" aria-labelledby="form-title">
          {registered ? (
            <div className="registration-success" role="status">
              <span className="success-mark" aria-hidden="true">
                ✓
              </span>
              <h1 id="form-title">Cadastro concluído</h1>
              <p>
                Sua conta de Cliente foi criada. Acesse com o e-mail{" "}
                <strong>{fields.email.trim()}</strong>.
              </p>
              <a className="primary-action" href="/login">
                Acessar conta
              </a>
            </div>
          ) : (
            <>
              <div className="form-heading">
                <h1 id="form-title">Crie sua conta</h1>
                <p>Os campos marcados como obrigatórios precisam ser preenchidos.</p>
              </div>

              <form
                className="registration-form"
                onSubmit={submitRegistration}
                aria-busy={isSubmitting}
              >
                <div className="field-grid identity-fields">
                  <label className="form-field name-field">
                    <span>
                      Nome completo{" "}
                      <span className="required-mark">(obrigatório)</span>
                    </span>
                    <input
                      autoComplete="name"
                      maxLength={160}
                      name="fullName"
                      onChange={(event) =>
                        updateField("fullName", event.currentTarget.value)
                      }
                      placeholder="Ex.: Ana Silva"
                      required
                      value={fields.fullName}
                    />
                  </label>
                  <label className="form-field">
                    <span>CPF <span className="optional-note">(opcional)</span></span>
                    <input
                      autoComplete="off"
                      maxLength={14}
                      name="cpf"
                      onChange={(event) =>
                        updateField("cpf", event.currentTarget.value)
                      }
                      placeholder="000.000.000-00"
                      value={fields.cpf}
                    />
                  </label>
                </div>

                <div className="field-grid institution-fields">
                  <label className="form-field institution-field">
                    <span>
                      Instituição <span className="required-mark">(obrigatório)</span>
                    </span>
                    <select
                      name="institutionId"
                      onChange={(event) =>
                        updateField(
                          "institutionId",
                          event.currentTarget.value === "UEM" ? "UEM" : "",
                        )
                      }
                      required
                      value={fields.institutionId}
                    >
                      <option value="">Selecione sua instituição</option>
                      <option value="UEM">
                        Universidade Estadual de Maringá - UEM
                      </option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>
                      Cidade / UF <span className="optional-note">(opcional)</span>
                    </span>
                    <input
                      autoComplete="address-level2"
                      maxLength={120}
                      name="cityUf"
                      onChange={(event) =>
                        updateField("cityUf", event.currentTarget.value)
                      }
                      placeholder="Ex.: Maringá, PR"
                      value={fields.cityUf}
                    />
                  </label>
                </div>

                <label className="form-field">
                  <span>
                    E-mail <span className="required-mark">(obrigatório)</span>
                  </span>
                  <input
                    autoComplete="email"
                    maxLength={320}
                    name="email"
                    onChange={(event) =>
                      updateField("email", event.currentTarget.value)
                    }
                    placeholder="voce@exemplo.com"
                    required
                    type="email"
                    value={fields.email}
                  />
                </label>

                <div className="field-grid password-fields">
                  <div className="form-field">
                    <label htmlFor="password">
                      Senha <span className="required-mark">(obrigatório)</span>
                    </label>
                    <input
                      autoComplete="new-password"
                      id="password"
                      name="password"
                      onChange={(event) =>
                        updateField("password", event.currentTarget.value)
                      }
                      required
                      type={showPassword ? "text" : "password"}
                      value={fields.password}
                    />
                    <button
                      className="visibility-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? "Ocultar senha" : "Mostrar senha"}
                    </button>
                  </div>
                  <div className="form-field">
                    <label htmlFor="confirmPassword">
                      Confirmar senha{" "}
                      <span className="required-mark">(obrigatório)</span>
                    </label>
                    <input
                      autoComplete="new-password"
                      id="confirmPassword"
                      name="confirmPassword"
                      onChange={(event) =>
                        updateField("confirmPassword", event.currentTarget.value)
                      }
                      required
                      type={showConfirmation ? "text" : "password"}
                      value={fields.confirmPassword}
                    />
                    <button
                      className="visibility-toggle"
                      onClick={() =>
                        setShowConfirmation((visible) => !visible)
                      }
                      type="button"
                      aria-label={
                        showConfirmation
                          ? "Ocultar confirmação de senha"
                          : "Mostrar confirmação de senha"
                      }
                    >
                      {showConfirmation
                        ? "Ocultar confirmação"
                        : "Mostrar confirmação"}
                    </button>
                  </div>
                </div>

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
                  {isSubmitting ? "Criando conta..." : "Criar conta"}
                </button>
              </form>
            </>
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
