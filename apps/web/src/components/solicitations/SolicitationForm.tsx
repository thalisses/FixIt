import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { BackButton } from "../BackButton";
import { tipoProblemaLabels, StatusBadge } from "../assets/assetPresentation";
import { formatProtocol, urgencyLabels, UrgencyBadge } from "./solicitationPresentation";
import {
  createSolicitation, SolicitationApiError,
  uploadSolicitationAttachments,
  type CreateSolicitationInput, type SolicitationDetail,
  type SolicitationFieldErrors,
} from "../../lib/solicitationApi";
import { markChangesSaved, useUnsavedChanges } from "../../lib/unsavedChanges";
import { SolicitationAttachmentPicker } from "./SolicitationAttachmentPicker";

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
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "uploaded" | "failed" | "uncertain">("idle");
  const [uploadError, setUploadError] = useState("");
  const batchRef = useRef<{ key: string; files: readonly File[] } | null>(null);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  useUnsavedChanges(
    (!created && (Object.values(values).some(Boolean) || files.length > 0)) ||
    Boolean(created && batchRef.current && uploadState !== "uploaded"),
  );

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  useEffect(() => { if (created) successRef.current?.focus(); }, [created]);

  async function sendImages(id: number, batch: { key: string; files: readonly File[] }) {
    setUploadState("uploading");
    setUploadError("");
    try {
      await uploadSolicitationAttachments(id, batch.key, batch.files);
      setUploadState("uploaded");
      markChangesSaved();
    } catch (error) {
      const uncertain = !(error instanceof SolicitationApiError) || error.code === "INVALID_RESPONSE" ||
        error.code === "ATTACHMENT_UPLOAD_UNCERTAIN" || (error.status >= 500 && error.code !== "ATTACHMENT_SAVE_FAILED");
      setUploadState(uncertain ? "uncertain" : "failed");
      setUploadError(error instanceof SolicitationApiError && error.fields.images ? error.fields.images : onRequestError(error));
    }
  }

  async function retryImages() {
    if (savingRef.current || !created || !batchRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try { await sendImages(created.id, batchRef.current); }
    finally { savingRef.current = false; setIsSaving(false); }
  }

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
      // Congela chave e arquivos antes de criar o chamado; não muda nos reenvios.
      const batch = files.length ? { key: crypto.randomUUID(), files: [...files] } : null;
      const result = await createSolicitation({
        local: values.local.trim(),
        tipoProblema: values.tipoProblema as CreateSolicitationInput["tipoProblema"],
        descricaoProblema: values.descricaoProblema.trim(),
        urgencia: values.urgencia as CreateSolicitationInput["urgencia"],
      });
      batchRef.current = batch;
      setCreated(result);
      if (batch) await sendImages(result.id, batch);
      else markChangesSaved();
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
      <h1 id="solicitation-created-title" ref={successRef} tabIndex={-1}>Solicitação {batchRef.current && uploadState !== "uploaded" ? "registrada" : "criada"}</h1>
      <div className="asset-card">
        {(!batchRef.current || uploadState === "uploaded") ? (
          <p className="form-success" role="status">Solicitação {formatProtocol(created)} registrada com sucesso.
            {uploadState === "uploaded" && ` ${batchRef.current?.files.length} ${batchRef.current?.files.length === 1 ? "imagem anexada" : "imagens anexadas"}.`}
          </p>
        ) : <p role="status">Solicitação {formatProtocol(created)} registrada.{uploadState === "uploading" && " Enviando as imagens..."}</p>}
        {(uploadState === "failed" || uploadState === "uncertain") && (
          <div className="solicitation-attachment-upload-error" role="alert">
            <p>{uploadState === "uncertain" ? "Não foi possível confirmar se as imagens foram salvas. A solicitação continua registrada." : "As imagens não foram salvas. A solicitação continua registrada."}</p>
            <p>{uploadError}</p>
            <p>As mesmas imagens serão usadas na nova tentativa, sem criar outro chamado. Recarregar ou sair desta tela perde a seleção local.</p>
          </div>
        )}
        {batchRef.current && uploadState !== "uploaded" && <ul aria-label="Imagens do envio">
          {batchRef.current.files.map((file, index) => <li className="solicitation-attachment-name" key={index}>{file.name}</li>)}
        </ul>}
        {(uploadState === "failed" || uploadState === "uncertain") && <button
          className="primary-action solicitation-action-button" type="button" disabled={isSaving}
          onClick={() => void retryImages()}>Tentar enviar as imagens novamente</button>}
        <p>Local: {created.local}</p>
        <p>Status: <StatusBadge status={created.status} /></p>
        <p>Urgência: <UrgencyBadge urgency={created.urgencia} /></p>
        <button className="primary-action solicitation-action-button" type="button" disabled={isSaving} onClick={onBack}>Voltar para solicitações</button>
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
        <p className="field-help">Os quatro campos abaixo são obrigatórios. As fotos são opcionais.</p>
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
        <SolicitationAttachmentPicker files={files} onChange={setFiles} disabled={isSaving} />
        <div className="asset-form-actions">
          <button className="text-action" disabled={isSaving} type="button" onClick={onBack}>Cancelar</button>
          <button className="primary-action solicitation-action-button" disabled={isSaving} type="submit">{isSaving ? "Registrando..." : "Criar solicitação"}</button>
        </div>
      </form>
    </section>
  );
}
