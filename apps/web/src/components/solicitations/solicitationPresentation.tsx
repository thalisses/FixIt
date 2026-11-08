import type {
  NivelPrioridade,
  NivelUrgencia,
  SolicitationListItem,
} from "../../lib/solicitationApi";

export const urgencyLabels: Record<NivelUrgencia, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
};

export const priorityLabels: Record<NivelPrioridade, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
};

export function formatProtocol(solicitation: SolicitationListItem): string {
  const year = new Date(solicitation.data).getFullYear();
  return `#CH-${year}-${String(solicitation.id).padStart(4, "0")}`;
}

const dateTimeInBrasilia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export function formatDateTime(timestamp: string): string {
  return dateTimeInBrasilia.format(new Date(timestamp));
}

export function UrgencyBadge({ urgency }: { urgency: NivelUrgencia }) {
  return (
    <span
      className={`asset-badge solicitation-urgency-${urgency.toLowerCase()}`}
    >
      {urgencyLabels[urgency]}
    </span>
  );
}

export function PriorityBadge({
  priority,
}: {
  priority: NivelPrioridade | null;
}) {
  if (!priority) {
    return <span className="solicitation-muted">Não definida</span>;
  }

  return (
    <span
      className={`asset-badge solicitation-priority-${priority.toLowerCase()}`}
    >
      {priorityLabels[priority]}
    </span>
  );
}
