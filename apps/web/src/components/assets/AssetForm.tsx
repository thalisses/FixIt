import { useState, type FormEvent } from "react";
import {
  createAsset,
  type Asset,
  type AssetFieldErrors,
} from "../../lib/assetApi";
import {
  AssetFields,
  emptyAssetForm,
  readFieldErrors,
  toAssetInput,
} from "./AssetFields";

interface AssetFormProps {
  onCancel(): void;
  onCreated(asset: Asset): void;
  onRequestError(error: unknown): string;
}

export function AssetForm({
  onCancel,
  onCreated,
  onRequestError,
}: AssetFormProps) {
  const [values, setValues] = useState(emptyAssetForm);
  const [fieldErrors, setFieldErrors] = useState<AssetFieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    setFieldErrors({});
    try {
      onCreated(await createAsset(toAssetInput(values)));
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
    <section className="asset-page" aria-labelledby="asset-form-title">
      <div className="asset-page-heading">
        <div>
          <h1 id="asset-form-title">Cadastrar bem</h1>
          <p>Registre o equipamento para que os chamados possam citá-lo.</p>
        </div>
      </div>

      <form
        className="asset-card asset-form"
        noValidate
        onSubmit={handleSubmit}
      >
        {errorMessage && (
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
        )}

        <AssetFields
          errors={fieldErrors}
          onChange={setValues}
          values={values}
        />

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
            {isSaving ? "Salvando..." : "Salvar bem"}
          </button>
        </div>
      </form>
    </section>
  );
}
