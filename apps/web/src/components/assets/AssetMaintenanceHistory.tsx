import { useEffect, useState } from "react";
import {
  listAssetSolicitations,
  type AssetSolicitation,
} from "../../lib/assetApi";
import { formatDay, StatusBadge, tipoProblemaLabels } from "./assetPresentation";

interface AssetMaintenanceHistoryProps {
  assetId: number;
  onRequestError(error: unknown): string;
}

/** Solicitações já abertas para o bem, da mais antiga para a mais recente (US006). */
export function AssetMaintenanceHistory({
  assetId,
  onRequestError,
}: AssetMaintenanceHistoryProps) {
  const [solicitations, setSolicitations] = useState<AssetSolicitation[]>([]);
  const [reloadCount, setReloadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage("");
    void listAssetSolicitations(assetId)
      .then((result) => {
        if (isCurrent) {
          setSolicitations(result);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setErrorMessage(onRequestError(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [assetId, reloadCount, onRequestError]);

  return (
    <section className="asset-card" aria-labelledby="asset-history-title">
      <h2 id="asset-history-title">Histórico de manutenções</h2>
      {errorMessage ? (
        <div className="management-error">
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
          <button
            className="text-action"
            onClick={() => setReloadCount((current) => current + 1)}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      ) : isLoading ? (
        <p className="asset-muted" role="status" aria-busy="true">
          Carregando histórico...
        </p>
      ) : solicitations.length === 0 ? (
        <p className="asset-muted" role="status">
          Nenhuma manutenção registrada para este bem.
        </p>
      ) : (
        <div className="asset-table-card">
          <table className="asset-table">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Tipo de problema</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {solicitations.map((solicitation) => (
                <tr key={solicitation.id}>
                  <td className="asset-history-date" data-label="Data">
                    {formatDay(solicitation.data)}
                  </td>
                  <td data-label="Tipo de problema">
                    {tipoProblemaLabels[solicitation.tipoProblema]}
                  </td>
                  <td data-label="Status">
                    <StatusBadge status={solicitation.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
