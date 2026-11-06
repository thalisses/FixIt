import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { BackButton } from "../components/BackButton";
import { AssetDetail } from "../components/assets/AssetDetail";
import { AssetForm } from "../components/assets/AssetForm";
import { AssetList } from "../components/assets/AssetList";
import { useAuth } from "../context/AuthContext";
import { AssetApiError, listAssets, type Asset } from "../lib/assetApi";
import "../styles/assets.css";

interface AssetsPageProps {
  path: string;
  onLoggedOut(): void;
  onNavigate(path: string): void;
}

export const NEW_ASSET_PATH = "/assets/novo";

type AssetRoute =
  | { name: "list" }
  | { name: "new" }
  | { name: "detail"; id: number };

/** Cada tela de bens tem endereço próprio, então voltar e recarregar funcionam. */
export function parseAssetRoute(path: string): AssetRoute {
  if (path === NEW_ASSET_PATH) {
    return { name: "new" };
  }
  const match = /^\/assets\/(\d+)$/.exec(path);
  return match ? { name: "detail", id: Number(match[1]) } : { name: "list" };
}

export function AssetsPage({ path, onLoggedOut, onNavigate }: AssetsPageProps) {
  const { refresh } = useAuth();
  const route = parseAssetRoute(path);
  const [successMessage, setSuccessMessage] = useState("");
  const [openedAsset, setOpenedAsset] = useState<Asset | null>(null);

  const handleRequestError = useCallback(
    (error: unknown): string => {
      if (error instanceof AssetApiError && error.status === 401) {
        void refresh();
        return "Sua sessão expirou. Entre novamente.";
      }
      if (error instanceof AssetApiError) {
        return error.message;
      }
      return "Não foi possível conectar ao servidor. Tente novamente.";
    },
    [refresh],
  );

  function goToList(message = "") {
    setSuccessMessage(message);
    onNavigate("/assets");
  }

  function openAsset(asset: Asset) {
    setSuccessMessage("");
    setOpenedAsset(asset);
    onNavigate(`/assets/${asset.id}`);
  }

  return (
    <AppShell activePath={path} onLoggedOut={onLoggedOut} onNavigate={onNavigate}>
      {route.name === "list" && (
        <AssetList
          onCreate={() => {
            setSuccessMessage("");
            onNavigate(NEW_ASSET_PATH);
          }}
          onOpen={openAsset}
          onRequestError={handleRequestError}
          successMessage={successMessage}
        />
      )}
      {route.name === "new" && (
        <AssetForm
          onCancel={() => goToList()}
          onCreated={(asset) =>
            goToList(`Bem ${asset.codigoPatrimonial} cadastrado.`)
          }
          onRequestError={handleRequestError}
        />
      )}
      {route.name === "detail" && (
        <AssetDetailRoute
          id={route.id}
          initialAsset={openedAsset?.id === route.id ? openedAsset : null}
          onBack={() => goToList()}
          onRequestError={handleRequestError}
          onUpdated={setOpenedAsset}
        />
      )}
    </AppShell>
  );
}

interface AssetDetailRouteProps {
  id: number;
  initialAsset: Asset | null;
  onBack(): void;
  onRequestError(error: unknown): string;
  onUpdated(asset: Asset): void;
}

/**
 * Quem chega pela lista já tem o bem. Quem chega pelo endereço, depois de
 * recarregar ou voltar no navegador, busca o bem pela listagem.
 */
function AssetDetailRoute({
  id,
  initialAsset,
  onBack,
  onRequestError,
  onUpdated,
}: AssetDetailRouteProps) {
  const [asset, setAsset] = useState<Asset | null>(initialAsset);
  const [status, setStatus] = useState<"ready" | "loading" | "missing" | "error">(
    initialAsset ? "ready" : "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (initialAsset) {
      setAsset(initialAsset);
      setStatus("ready");
      return undefined;
    }

    let isCurrent = true;
    setStatus("loading");
    void listAssets()
      .then((assets) => {
        if (!isCurrent) {
          return;
        }
        const found = assets.find((candidate) => candidate.id === id) ?? null;
        setAsset(found);
        setStatus(found ? "ready" : "missing");
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setErrorMessage(onRequestError(error));
          setStatus("error");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [id, initialAsset, onRequestError, reloadCount]);

  if (status === "ready" && asset) {
    return (
      <AssetDetail
        asset={asset}
        onBack={onBack}
        onRequestError={onRequestError}
        onUpdated={(updated) => {
          setAsset(updated);
          onUpdated(updated);
        }}
      />
    );
  }

  return (
    <section className="asset-page" aria-labelledby="asset-route-title">
      <BackButton label="Voltar para Patrimônio" onClick={onBack} />
      {status === "loading" && (
        <p className="asset-muted" role="status" aria-busy="true">
          <span id="asset-route-title">Carregando bem...</span>
        </p>
      )}
      {status === "missing" && (
        <div className="asset-card" role="status">
          <h1 id="asset-route-title" className="asset-route-title">
            Bem não encontrado
          </h1>
          <p className="asset-muted">
            Ele pode ter mudado de endereço. Volte para a lista e busque pelo
            código ou pela descrição.
          </p>
        </div>
      )}
      {status === "error" && (
        <div className="management-error">
          <p className="form-error" id="asset-route-title" role="alert">
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
      )}
    </section>
  );
}
