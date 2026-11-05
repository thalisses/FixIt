import { useCallback, useState } from "react";
import { AppShell } from "../components/AppShell";
import { AssetDetail } from "../components/assets/AssetDetail";
import { AssetForm } from "../components/assets/AssetForm";
import { AssetList } from "../components/assets/AssetList";
import { useAuth } from "../context/AuthContext";
import { AssetApiError, type Asset } from "../lib/assetApi";

interface AssetsPageProps {
  onLoggedOut(): void;
  onNavigate(path: string): void;
}

type AssetView =
  | { name: "list"; successMessage: string }
  | { name: "new" }
  | { name: "detail"; asset: Asset };

const listView: AssetView = { name: "list", successMessage: "" };

export function AssetsPage({ onLoggedOut, onNavigate }: AssetsPageProps) {
  const { refresh } = useAuth();
  const [view, setView] = useState<AssetView>(listView);

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

  return (
    <AppShell
      activePath="/assets"
      onLoggedOut={onLoggedOut}
      onNavigate={onNavigate}
    >
      {view.name === "list" && (
        <AssetList
          onCreate={() => setView({ name: "new" })}
          onOpen={(asset) => setView({ name: "detail", asset })}
          onRequestError={handleRequestError}
          successMessage={view.successMessage}
        />
      )}
      {view.name === "new" && (
        <AssetForm
          onCancel={() => setView(listView)}
          onCreated={(asset) =>
            setView({
              name: "list",
              successMessage: `Bem ${asset.codigoPatrimonial} cadastrado.`,
            })
          }
          onRequestError={handleRequestError}
        />
      )}
      {view.name === "detail" && (
        <AssetDetail
          asset={view.asset}
          onBack={() => setView(listView)}
          onRequestError={handleRequestError}
          onUpdated={(asset) => setView({ name: "detail", asset })}
        />
      )}
    </AppShell>
  );
}
