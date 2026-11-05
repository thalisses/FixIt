import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AssetApiError,
  createAsset,
  type Asset,
  type AssetFieldErrors,
  type NewAssetInput,
} from "../../lib/assetApi";
import { estadoLabels, estadoOptions } from "./assetPresentation";

interface AssetFormProps {
  onCancel(): void;
  onCreated(asset: Asset): void;
  onRequestError(error: unknown): string;
}

const emptyForm = {
  codigoPatrimonial: "",
  descricao: "",
  localizacao: "",
  estadoConservacao: "",
  dataAquisicao: "",
  garantia: "",
};

export function AssetForm({
  onCancel,
  onCreated,
  onRequestError,
}: AssetFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<AssetFieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [fieldErrors]);

  function setField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    setFieldErrors({});
    try {
      onCreated(
        await createAsset({
          ...form,
          estadoConservacao:
            form.estadoConservacao as NewAssetInput["estadoConservacao"],
          dataAquisicao: form.dataAquisicao || null,
          garantia: form.garantia || null,
        }),
      );
    } catch (error) {
      if (error instanceof AssetApiError && error.status === 409) {
        setFieldErrors({ codigoPatrimonial: error.message });
      } else if (
        error instanceof AssetApiError &&
        Object.keys(error.fields).length > 0
      ) {
        setFieldErrors(error.fields);
      } else {
        setErrorMessage(onRequestError(error));
      }
      setIsSaving(false);
    }
  }

  function fieldProps(field: keyof typeof emptyForm) {
    return {
      "aria-describedby": fieldErrors[field] ? `${field}-error` : undefined,
      "aria-invalid": fieldErrors[field] ? true : undefined,
      name: field,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
      ) => setField(field, event.target.value),
      value: form[field],
    };
  }

  function fieldError(field: keyof typeof emptyForm) {
    return (
      fieldErrors[field] && (
        <span className="asset-field-error" id={`${field}-error`}>
          {fieldErrors[field]}
        </span>
      )
    );
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
        ref={formRef}
      >
        {errorMessage && (
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="asset-form-grid">
          <label className="form-field">
            <span>
              Código patrimonial <span className="required-mark">*</span>
            </span>
            <input {...fieldProps("codigoPatrimonial")} type="text" />
            {fieldError("codigoPatrimonial")}
          </label>

          <label className="form-field">
            <span>
              Estado de conservação <span className="required-mark">*</span>
            </span>
            <select {...fieldProps("estadoConservacao")}>
              <option value="">Selecione</option>
              {estadoOptions.map((estado) => (
                <option key={estado} value={estado}>
                  {estadoLabels[estado]}
                </option>
              ))}
            </select>
            {fieldError("estadoConservacao")}
          </label>

          <label className="form-field asset-form-wide">
            <span>
              Descrição <span className="required-mark">*</span>
            </span>
            <input {...fieldProps("descricao")} type="text" />
            <span className="field-help">
              Inclua marca, modelo e características.
            </span>
            {fieldError("descricao")}
          </label>

          <label className="form-field asset-form-wide">
            <span>
              Localização <span className="required-mark">*</span>
            </span>
            <input {...fieldProps("localizacao")} type="text" />
            <span className="field-help">Informe o prédio e a sala.</span>
            {fieldError("localizacao")}
          </label>

          <label className="form-field">
            <span>Data de aquisição</span>
            <input {...fieldProps("dataAquisicao")} type="date" />
            {fieldError("dataAquisicao")}
          </label>

          <label className="form-field">
            <span>Garantia até</span>
            <input {...fieldProps("garantia")} type="date" />
            {fieldError("garantia")}
          </label>
        </div>

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
