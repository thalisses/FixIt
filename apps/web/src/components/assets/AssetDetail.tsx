import { useState, type FormEvent } from "react";
import {
  AssetApiError,
  updateAsset,
  type Asset,
  type AssetFieldErrors,
  type EstadoConservacao,
} from "../../lib/assetApi";
import {
  ConditionBadge,
  estadoLabels,
  estadoOptions,
  formatDate,
} from "./assetPresentation";

interface AssetDetailProps {
  asset: Asset;
  onBack(): void;
  onUpdated(asset: Asset): void;
  onRequestError(error: unknown): string;
}

export function AssetDetail({
  asset,
  onBack,
  onUpdated,
  onRequestError,
}: AssetDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localizacao, setLocalizacao] = useState(asset.localizacao);
  const [estado, setEstado] = useState<EstadoConservacao>(
    asset.estadoConservacao,
  );
  const [fieldErrors, setFieldErrors] = useState<AssetFieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function startEditing() {
    setLocalizacao(asset.localizacao);
    setEstado(asset.estadoConservacao);
    setFieldErrors({});
    setErrorMessage("");
    setSuccessMessage("");
    setIsEditing(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setErrorMessage("");
    try {
      onUpdated(
        await updateAsset(asset.id, {
          localizacao,
          estadoConservacao: estado,
        }),
      );
      setIsEditing(false);
      setSuccessMessage("Alterações salvas.");
    } catch (error) {
      if (error instanceof AssetApiError && Object.keys(error.fields).length) {
        setFieldErrors(error.fields);
      } else {
        setErrorMessage(onRequestError(error));
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="asset-page" aria-labelledby="asset-detail-title">
      <nav aria-label="Caminho" className="asset-breadcrumb">
        <button className="asset-link" onClick={onBack} type="button">
          Patrimônio
        </button>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Ficha de {asset.codigoPatrimonial}</span>
      </nav>

      <div className="asset-page-heading">
        <div>
          <p className="asset-code">{asset.codigoPatrimonial}</p>
          <h1 id="asset-detail-title">{asset.descricao}</h1>
          <ConditionBadge estado={asset.estadoConservacao} />
        </div>
        {!isEditing && (
          <button
            className="primary-action asset-action"
            onClick={startEditing}
            type="button"
          >
            Editar bem
          </button>
        )}
      </div>

      {successMessage && (
        <p className="form-success" role="status">
          {successMessage}
        </p>
      )}

      {isEditing && (
        <form
          aria-label="Editar bem"
          className="asset-card asset-form"
          noValidate
          onSubmit={handleSubmit}
        >
          <h2>Editar localização e estado</h2>
          {errorMessage && (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="asset-form-grid">
            <label className="form-field">
              <span>Localização</span>
              <input
                aria-describedby={
                  fieldErrors.localizacao ? "edit-location-error" : undefined
                }
                aria-invalid={fieldErrors.localizacao ? true : undefined}
                onChange={(event) => setLocalizacao(event.target.value)}
                type="text"
                value={localizacao}
              />
              {fieldErrors.localizacao && (
                <span className="asset-field-error" id="edit-location-error">
                  {fieldErrors.localizacao}
                </span>
              )}
            </label>
            <label className="form-field">
              <span>Estado de conservação</span>
              <select
                onChange={(event) =>
                  setEstado(event.target.value as EstadoConservacao)
                }
                value={estado}
              >
                {estadoOptions.map((option) => (
                  <option key={option} value={option}>
                    {estadoLabels[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="asset-form-actions">
            <button
              className="text-action"
              disabled={isSaving}
              onClick={() => setIsEditing(false)}
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
      )}

      <div className="asset-detail-grid">
        <div className="asset-card">
          <h2>Localização</h2>
          <p className="asset-location">{asset.localizacao}</p>
        </div>
        <div className="asset-card">
          <h2>Dados do bem</h2>
          <dl className="asset-facts">
            <div>
              <dt>Data de aquisição</dt>
              <dd>{formatDate(asset.dataAquisicao)}</dd>
            </div>
            <div>
              <dt>Garantia até</dt>
              <dd>{formatDate(asset.garantia)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="asset-card">
        <h2>Histórico de manutenções</h2>
        <p className="asset-muted" role="status">
          Nenhuma manutenção registrada.
        </p>
      </div>
    </section>
  );
}
