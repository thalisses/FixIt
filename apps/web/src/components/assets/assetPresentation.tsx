import type {
  AreaTecnica,
  EstadoConservacao,
  StatusSolicitacao,
} from "../../lib/assetApi";

export const tipoProblemaLabels: Record<AreaTecnica, string> = {
  ELETRICA: "Elétrica",
  HIDRAULICA: "Hidráulica",
  INFORMATICA: "Informática",
  ESTRUTURAL: "Estrutural",
  OUTROS: "Outros",
};

export const statusLabels: Record<StatusSolicitacao, string> = {
  EM_ABERTO: "Em aberto",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  CANCELADA: "Cancelada",
};

// O dia de Brasília, para uma abertura às 22h não aparecer no dia seguinte.
const dayInBrasilia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDay(timestamp: string): string {
  return dayInBrasilia.format(new Date(timestamp));
}

export function StatusBadge({ status }: { status: StatusSolicitacao }) {
  return (
    <span
      className={`asset-badge asset-status-${status.toLowerCase().replaceAll("_", "-")}`}
    >
      {statusLabels[status]}
    </span>
  );
}

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
