import type { MaintenanceReport, ReportStatusCounts } from "./reportApi";
import { formatReportAverage } from "./reportPresentation";

// Keep the labels and order aligned with the report panel.
const statuses = [
  ["EM_ABERTO", "Em aberto"],
  ["EM_ATENDIMENTO", "Em atendimento"],
  ["CONCLUIDO", "Concluídas"],
  ["CANCELADA", "Canceladas"],
] as const satisfies ReadonlyArray<readonly [keyof ReportStatusCounts, string]>;

type CsvCell = string | number;

function encodeCell(cell: CsvCell): string {
  if (typeof cell === "number") {
    return String(cell);
  }

  // Spreadsheet importers may ignore whitespace and control characters before a formula.
  const needsProtection =
    /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(cell) || /^[\t\r\n]/.test(cell);
  const text = needsProtection ? `'${cell}` : cell;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function generateReportCsv(report: MaintenanceReport): string {
  const rows: CsvCell[][] = [
    ["Seção", "Indicador", "Valor", "Posição", "Bem", "Código patrimonial", "Solicitações"],
    ["Resumo", "Total de solicitações", report.total, "", "", "", ""],
    ["Resumo", "Tempo médio até conclusão", formatReportAverage(report.averageResolutionHours), "", "", "", ""],
  ];

  for (const [status, label] of statuses) {
    rows.push(["Solicitações por status", label, report.byStatus[status], "", "", "", ""]);
  }

  report.topAssets.forEach(({ asset, count }, index) => {
    rows.push(["Bens com mais solicitações", "", "", index + 1, asset.descricao, asset.codigoPatrimonial, count]);
  });

  return rows.map((row) => row.map(encodeCell).join(",")).join("\r\n");
}
