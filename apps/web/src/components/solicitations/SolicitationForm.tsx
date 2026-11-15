import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { BackButton } from "../BackButton";
import { tipoProblemaLabels, StatusBadge } from "../assets/assetPresentation";
import { formatProtocol, urgencyLabels, UrgencyBadge } from "./solicitationPresentation";
import {
  createSolicitation, SolicitationApiError,
  type CreateSolicitationInput, type SolicitationDetail,
  type SolicitationFieldErrors,
} from "../../lib/solicitationApi";
import { markChangesSaved, useUnsavedChanges } from "../../lib/unsavedChanges";

const emptyValues = { local: "", tipoProblema: "", descricaoProblema: "", urgencia: "" };
const labels = {
  local: "Local", tipoProblema: "Tipo de problema",
  descricaoProblema: "Descrição do problema", urgencia: "Urgência",
};

interface SolicitationFormProps {
  onBack(): void;
  onRequestError(error: unknown): string;
}

export function SolicitationForm({ onBack, onRequestError }: SolicitationFormProps) {
  const [values, setValues] = useState(emptyValues);
  const [errors, setErrors] = useState<SolicitationFieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [created, setCreated] = useState<SolicitationDetail | null>(null);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  useUnsavedChanges(!created && Object.values(values).some(Boolean));

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  useEffect(() => { if (created) successRef.current?.focus(); }, [created]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || created) return;
    const nextErrors: SolicitationFieldErrors = {};
    for (const field of Object.keys(labels) as (keyof typeof labels)[]) {
      if (!values[field].trim()) nextErrors[field] = `Informe ${labels[field].toLowerCase()}.`;
    }
    setErrors(nextErrors);
    setErrorMessage("");
    if (Object.keys(nextErrors).length) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const result = await createSolicitation({
        local: values.local.trim(),
        tipoProblema: values.tipoProblema as CreateSolicitationInput["tipoProblema"],
        descricaoProblema: values.descricaoProblema.trim(),
        urgencia: values.urgencia as CreateSolicitationInput["urgencia"],
      });
      markChangesSaved();
      setCreated(result);
    } catch (error) {
      if (error instanceof SolicitationApiError) setErrors(error.fields);
      setErrorMessage(onRequestError(error));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function fieldProps(field: keyof typeof labels) {
    return {
      id: `create-${field}`, name: field, required: true, value: values[field],
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby": errors[field] ? `create-${field}-error` : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setValues((current) => ({ ...current, [field]: event.target.value }));
      },
    };
  }

  if (created) return (
    <section className="asset-page" aria-labelledby="solicitation-created-title">
      <h1 id="solicitation-created-title" ref={successRef} tabIndex={-1}>Solicitação criada</h1>
      <div className="asset-card">
        <p className="form-success" role="status">Solicitação {formatProtocol(created)} registrada com sucesso.</p>
        <p>Local: {created.local}</p>
        <p>Status: <StatusBadge status={created.status} /></p>
        <p>Urgência: <UrgencyBadge urgency={created.urgencia} /></p>
        <button className="primary-action solicitation-action-button" type="button" onClick={onBack}>Voltar para solicitações</button>
      </div>
    </section>
  );

  return (
    <section className="asset-page" aria-labelledby="solicitation-form-title">
      <BackButton label="Voltar para solicitações" onClick={onBack} />
      <div className="asset-page-heading"><div>
        <h1 id="solicitation-form-title">Nova solicitação</h1>
        <p>Descreva o problema para registrar um chamado de manutenção.</p>
      </div></div>
      <form ref={formRef} className="asset-card asset-form solicitation-create-form" noValidate onSubmit={submit} aria-busy={isSaving}>
        <p className="field-help">Todos os campos são obrigatórios.</p>
        {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
        <fieldset disabled={isSaving} className="solicitation-create-fields">
          <legend>Dados da solicitação</legend>
          {(Object.keys(labels) as (keyof typeof labels)[]).map((field) => (
            <div className={`form-field ${field === "descricaoProblema" ? "asset-form-wide" : ""}`} key={field}>
              <label htmlFor={`create-${field}`}>{labels[field]} <span className="required-mark">*</span></label>
              {field === "tipoProblema" || field === "urgencia" ? (
                <select {...fieldProps(field)}>
                  <option value="">Selecione</option>
                  {Object.entries(field === "tipoProblema" ? tipoProblemaLabels : urgencyLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              ) : field === "descricaoProblema" ? (
                <textarea {...fieldProps(field)} rows={5} />
              ) : <input {...fieldProps(field)} type="text" />}
              {errors[field] && <span className="asset-field-error" id={`create-${field}-error`}>{errors[field]}</span>}
            </div>
          ))}
        </fieldset>
        <div className="asset-form-actions">
          <button className="text-action" disabled={isSaving} type="button" onClick={onBack}>Cancelar</button>
          <button className="primary-action solicitation-action-button" disabled={isSaving} type="submit">{isSaving ? "Registrando..." : "Criar solicitação"}</button>
        </div>
      </form>
    </section>
  );
}
