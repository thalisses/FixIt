import { useEffect, useState, type FormEvent } from "react";
import { listAssets, type Asset } from "../../lib/assetApi";
import { ConditionBadge } from "./assetPresentation";

interface AssetListProps {
  successMessage: string;
  onCreate(): void;
  onOpen(asset: Asset): void;
  onRequestError(error: unknown): string;
}

export function AssetList({
  successMessage,
  onCreate,
  onOpen,
  onRequestError,
}: AssetListProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage("");
    void listAssets(appliedSearch)
      .then((result) => {
        if (isCurrent) {
          setAssets(result);
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
  }, [appliedSearch, reloadCount, onRequestError]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setAppliedSearch(searchText.trim());
  }

  function clearSearch() {
    setSearchText("");
    setAppliedSearch("");
  }

  return (
    <section className="asset-page" aria-labelledby="assets-title">
      <div className="asset-page-heading">
        <div>
          <h1 id="assets-title">Patrimônio</h1>
          <p>Consulte os bens da instituição e cadastre novos equipamentos.</p>
        </div>
        <button
          className="primary-action asset-action"
          onClick={onCreate}
          type="button"
        >
          Cadastrar bem
        </button>
      </div>

      {successMessage && (
        <p className="form-success" role="status">
          {successMessage}
        </p>
      )}

      <form className="asset-search" onSubmit={handleSearch} role="search">
        <label className="form-field">
          <span>Buscar por código ou descrição</span>
          <input
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Ex.: PAT-1024 ou projetor"
            type="search"
            value={searchText}
          />
        </label>
        <button className="text-action" type="submit">
          Buscar
        </button>
      </form>

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
        <div className="asset-loading" role="status" aria-busy="true">
          Carregando bens...
        </div>
      ) : assets.length === 0 ? (
        <div className="asset-empty" role="status">
          {appliedSearch ? (
            <>
              <p>Nenhum bem encontrado para “{appliedSearch}”.</p>
              <button
                className="text-action"
                onClick={clearSearch}
                type="button"
              >
                Limpar busca
              </button>
            </>
          ) : (
            <p>Nenhum bem cadastrado ainda.</p>
          )}
        </div>
      ) : (
        <div className="asset-table-card">
          <table className="asset-table">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Descrição</th>
                <th scope="col">Localização</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="asset-visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="asset-code" data-label="Código">
                    {asset.codigoPatrimonial}
                  </td>
                  <td data-label="Descrição">{asset.descricao}</td>
                  <td data-label="Localização">{asset.localizacao}</td>
                  <td data-label="Estado">
                    <ConditionBadge estado={asset.estadoConservacao} />
                  </td>
                  <td className="asset-table-action">
                    <button
                      aria-label={`Ver ficha de ${asset.codigoPatrimonial}`}
                      className="text-action"
                      onClick={() => onOpen(asset)}
                      type="button"
                    >
                      Ver ficha
                    </button>
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
