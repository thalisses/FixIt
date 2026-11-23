export function formatReportAverage(hours: number | null): string {
  if (hours === null) {
    return "Sem solicitações concluídas";
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} h`;
  }
  return `${(hours / 24).toFixed(1)} dias`;
}
