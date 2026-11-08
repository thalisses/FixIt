import { useState, type FormEvent } from "react";
import {
  addSolicitationObservation,
  SolicitationApiError,
  type SolicitationHistoryEntry,
} from "../../lib/solicitationApi";
import { useUnsavedChanges } from "../../lib/unsavedChanges";

const MAX_OBSERVATION_LENGTH = 2000;

interface SolicitationObservationFormProps {
  solicitationId: number;
  onAdded(entry: SolicitationHistoryEntry): void;
  onRequestError(error: unknown): string;
}

/** Campo em que o responsável registra o que foi feito no atendimento (US017). */
export function SolicitationObservationForm({
  solicitationId,
  onAdded,
  onRequestError,
}: SolicitationObservationFormProps) {
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const text = draft.trim();

  useUnsavedChanges(text.length > 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      onAdded(await addSolicitationObservation(solicitationId, text));
      setDraft("");
      setSuccessMessage("Observação registrada.");
    } catch (error) {
      setErrorMessage(
        (error instanceof SolicitationApiError && error.fields.descricao) ||
          onRequestError(error),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="solicitation-observation-form" onSubmit={submit}>
      <label className="form-field">
        <span>Observação de execução</span>
        <textarea
          aria-describedby="solicitation-observation-hint"
          aria-invalid={Boolean(errorMessage)}
          maxLength={MAX_OBSERVATION_LENGTH}
          name="descricao"
          onChange={(event) => {
            setDraft(event.target.value);
            setErrorMessage("");
            setSuccessMessage("");
          }}
          placeholder="O que foi feito neste atendimento?"
          rows={3}
          value={draft}
        />
      </label>
      <p className="solicitation-observation-hint" id="solicitation-observation-hint">
        Fica registrada com seu nome e a data, e não pode ser editada depois.{" "}
        {draft.length} de 2.000 caracteres.
      </p>
      {errorMessage && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p className="form-success" role="status">
          {successMessage}
        </p>
      )}
      <button
        className="primary-action solicitation-action-button"
        disabled={!text || isSaving}
        type="submit"
      >
        {isSaving ? "Salvando..." : "Registrar observação"}
      </button>
    </form>
  );
}
