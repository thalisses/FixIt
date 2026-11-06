import { useState } from "react";
import type { Asset } from "../../lib/assetApi";
import { AssetEditForm } from "./AssetEditForm";
import { AssetMaintenanceHistory } from "./AssetMaintenanceHistory";
import { ConditionBadge, formatDate } from "./assetPresentation";

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
  const [successMessage, setSuccessMessage] = useState("");

  function startEditing() {
    setSuccessMessage("");
    setIsEditing(true);
  }

  function handleSaved(updated: Asset) {
    onUpdated(updated);
    setIsEditing(false);
    setSuccessMessage("Alterações salvas.");
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
        <AssetEditForm
          asset={asset}
          onCancel={() => setIsEditing(false)}
          onRequestError={onRequestError}
          onSaved={handleSaved}
        />
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

      <AssetMaintenanceHistory
        assetId={asset.id}
        onRequestError={onRequestError}
      />
    </section>
  );
}
