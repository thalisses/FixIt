import type { EstadoConservacao } from "../../lib/assetApi";

export const estadoLabels: Record<EstadoConservacao, string> = {
  NOVO: "Novo",
  BOM: "Bom",
  REGULAR: "Regular",
  RUIM: "Ruim",
  INSERVIVEL: "Inservível",
};

export const estadoOptions = Object.keys(estadoLabels) as EstadoConservacao[];

export function formatDate(value: string | null): string {
  if (!value) {
    return "Não informada";
  }
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function ConditionBadge({ estado }: { estado: EstadoConservacao }) {
  return (
    <span className={`asset-badge asset-badge-${estado.toLowerCase()}`}>
      {estadoLabels[estado]}
    </span>
  );
}
