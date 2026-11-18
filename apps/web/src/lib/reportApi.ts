export interface ReportStatusCounts {
  EM_ABERTO: number;
  EM_ATENDIMENTO: number;
  CONCLUIDO: number;
  CANCELADA: number;
}

export interface ReportTopAsset {
  asset: {
    id: number;
    codigoPatrimonial: string;
    descricao: string;
  };
  count: number;
}

export interface MaintenanceReport {
  total: number;
  byStatus: ReportStatusCounts;
  averageResolutionHours: number | null;
  topAssets: ReportTopAsset[];
  hasData: boolean;
}

export class ReportApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReportApiError";
  }
}

export async function getMaintenanceReport(): Promise<MaintenanceReport> {
  const response = await fetch("/api/reports/maintenance", {
    credentials: "same-origin",
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {};
    throw new ReportApiError(
      response.status,
      typeof error.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error.message === "string"
        ? error.message
        : "Não foi possível carregar o relatório.",
    );
  }

  if (!isRecord(body) || !isMaintenanceReport(body.data)) {
    throw new ReportApiError(
      response.status,
      "INVALID_RESPONSE",
      "A resposta do servidor não contém um relatório válido.",
    );
  }

  return body.data;
}

function isMaintenanceReport(value: unknown): value is MaintenanceReport {
  return (
    isRecord(value) &&
    typeof value.total === "number" &&
    isStatusCounts(value.byStatus) &&
    (typeof value.averageResolutionHours === "number" ||
      value.averageResolutionHours === null) &&
    Array.isArray(value.topAssets) &&
    value.topAssets.every(isTopAsset) &&
    typeof value.hasData === "boolean"
  );
}

function isStatusCounts(value: unknown): value is ReportStatusCounts {
  return (
    isRecord(value) &&
    typeof value.EM_ABERTO === "number" &&
    typeof value.EM_ATENDIMENTO === "number" &&
    typeof value.CONCLUIDO === "number" &&
    typeof value.CANCELADA === "number"
  );
}

function isTopAsset(value: unknown): value is ReportTopAsset {
  return (
    isRecord(value) &&
    isRecord(value.asset) &&
    typeof value.asset.id === "number" &&
    typeof value.asset.codigoPatrimonial === "string" &&
    typeof value.asset.descricao === "string" &&
    typeof value.count === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
