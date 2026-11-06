import { useEffect, useRef, type ChangeEvent } from "react";
import {
  AssetApiError,
  type Asset,
  type AssetFieldErrors,
  type NewAssetInput,
} from "../../lib/assetApi";
import { estadoLabels, estadoOptions } from "./assetPresentation";

export interface AssetFormValues {
  codigoPatrimonial: string;
  descricao: string;
  localizacao: string;
  estadoConservacao: string;
  dataAquisicao: string;
  garantia: string;
}

export const emptyAssetForm: AssetFormValues = {
  codigoPatrimonial: "",
  descricao: "",
  localizacao: "",
  estadoConservacao: "",
  dataAquisicao: "",
  garantia: "",
};

export function toFormValues(asset: Asset): AssetFormValues {
  return {
    codigoPatrimonial: asset.codigoPatrimonial,
    descricao: asset.descricao,
    localizacao: asset.localizacao,
    estadoConservacao: asset.estadoConservacao,
    dataAquisicao: asset.dataAquisicao ?? "",
    garantia: asset.garantia ?? "",
  };
}

export function hasChanges(
  values: AssetFormValues,
  initial: AssetFormValues,
): boolean {
  return (Object.keys(initial) as (keyof AssetFormValues)[]).some(
    (field) => values[field] !== initial[field],
  );
}

export function toAssetInput(values: AssetFormValues): NewAssetInput {
  return {
    ...values,
    estadoConservacao:
      values.estadoConservacao as NewAssetInput["estadoConservacao"],
    dataAquisicao: values.dataAquisicao || null,
    garantia: values.garantia || null,
  };
}

export function readFieldErrors(error: unknown): AssetFieldErrors | null {
  if (!(error instanceof AssetApiError)) {
    return null;
  }
  if (error.status === 409) {
    return { codigoPatrimonial: error.message };
  }
  return Object.keys(error.fields).length > 0 ? error.fields : null;
}

interface AssetFieldsProps {
  errors: AssetFieldErrors;
  values: AssetFormValues;
  onChange(values: AssetFormValues): void;
}

export function AssetFields({ errors, values, onChange }: AssetFieldsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errors]);

  function fieldProps(field: keyof AssetFormValues) {
    return {
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
      "aria-invalid": errors[field] ? true : undefined,
      name: field,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        onChange({ ...values, [field]: event.target.value }),
      value: values[field],
    };
  }

  function fieldError(field: keyof AssetFormValues) {
    return (
      errors[field] && (
        <span className="asset-field-error" id={`${field}-error`}>
          {errors[field]}
        </span>
      )
    );
  }

  return (
    <div className="asset-form-grid" ref={containerRef}>
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
  );
}
