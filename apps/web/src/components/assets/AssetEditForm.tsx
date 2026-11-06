import { useState, type FormEvent } from "react";
import {
  confirmDiscardChanges,
  markChangesSaved,
  useUnsavedChanges,
} from "../../lib/unsavedChanges";
import {
  updateAsset,
  type Asset,
  type AssetFieldErrors,
} from "../../lib/assetApi";
import {
  AssetFields,
  hasChanges,
  readFieldErrors,
  toAssetInput,
  toFormValues,
} from "./AssetFields";

interface AssetEditFormProps {
  asset: Asset;
  onCancel(): void;
  onSaved(asset: Asset): void;
  onRequestError(error: unknown): string;
}

export function AssetEditForm({
  asset,
  onCancel,
  onSaved,
  onRequestError,
}: AssetEditFormProps) {
  const [initialValues] = useState(() => toFormValues(asset));
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState<AssetFieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  useUnsavedChanges(!isSaving && hasChanges(values, initialValues));

  function handleCancel() {
    if (confirmDiscardChanges()) {
      onCancel();
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setErrorMessage("");
    try {
      const saved = await updateAsset(asset.id, toAssetInput(values));
      markChangesSaved();
      onSaved(saved);
    } catch (error) {
      const errors = readFieldErrors(error);
      if (errors) {
        setFieldErrors(errors);
      } else {
        setErrorMessage(onRequestError(error));
      }
      setIsSaving(false);
    }
  }

  return (
    <form
      aria-label="Editar bem"
      className="asset-card asset-form"
      noValidate
      onSubmit={handleSubmit}
    >
      <h2>Editar bem</h2>
      {errorMessage && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}

      <AssetFields errors={fieldErrors} onChange={setValues} values={values} />

      <p className="field-help">* Campos obrigatórios.</p>

      <div className="asset-form-actions">
        <button
          className="text-action"
          disabled={isSaving}
          onClick={handleCancel}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="primary-action asset-action"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
