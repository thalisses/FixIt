import { useState, type FormEvent } from "react";
import {
  updateAsset,
  type Asset,
  type AssetFieldErrors,
} from "../../lib/assetApi";
import {
  AssetFields,
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
  const [values, setValues] = useState(() => toFormValues(asset));
  const [fieldErrors, setFieldErrors] = useState<AssetFieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setErrorMessage("");
    try {
      onSaved(await updateAsset(asset.id, toAssetInput(values)));
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
          onClick={onCancel}
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
