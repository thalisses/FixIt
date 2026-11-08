import type { AreaTecnica, StatusSolicitacao } from "./assetApi";

export type NivelUrgencia = "BAIXA" | "MEDIA" | "ALTA";
export type NivelPrioridade = "BAIXA" | "MEDIA" | "ALTA";

export interface SolicitationUser {
  id: string;
  fullName: string;
}

export interface SolicitationAsset {
  id: number;
  codigoPatrimonial: string;
  descricao: string;
}

export interface SolicitationListItem {
  id: number;
  data: string;
  local: string;
  tipoProblema: AreaTecnica;
  setorResponsavel: string | null;
  urgencia: NivelUrgencia;
  prioridade: NivelPrioridade | null;
  status: StatusSolicitacao;
  dataConclusao: string | null;
  solicitante: SolicitationUser | null;
  responsavel: SolicitationUser | null;
  bem: SolicitationAsset | null;
}

export interface SolicitationDetail extends SolicitationListItem {
  descricaoProblema: string;
  observacoes: string | null;
}

export interface SolicitationFilters {
  status?: StatusSolicitacao | "";
  setor?: string;
  tipo?: AreaTecnica | "";
  prioridade?: NivelPrioridade | "";
  de?: string;
  ate?: string;
  semResponsavel?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SolicitationPage {
  data: SolicitationListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export type SolicitationFieldErrors = Record<string, string>;

export class SolicitationApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: SolicitationFieldErrors = {},
  ) {
    super(message);
    this.name = "SolicitationApiError";
  }
}

export async function getSolicitation(
  id: number,
): Promise<SolicitationDetail> {
  const body = await request(
    `/api/solicitations/${encodeURIComponent(id)}`,
    "Não foi possível carregar a solicitação.",
  );

  return readDetail(body);
}

export async function changeSolicitationStatus(
  id: number,
  status: StatusSolicitacao,
): Promise<SolicitationDetail> {
  const body = await request(
    `/api/solicitations/${encodeURIComponent(id)}/status`,
    "Não foi possível alterar o status da solicitação.",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ status }),
    },
  );

  return readDetail(body);
}

export async function changeSolicitationPriority(
  id: number,
  prioridade: NivelPrioridade,
): Promise<SolicitationDetail> {
  const body = await request(
    `/api/solicitations/${encodeURIComponent(id)}/priority`,
    "Não foi possível alterar a prioridade da solicitação.",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ prioridade }),
    },
  );

  return readDetail(body);
}

export async function listSolicitations(
  filters: SolicitationFilters = {},
): Promise<SolicitationPage> {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.setor?.trim()) {
    params.set("setor", filters.setor.trim());
  }
  if (filters.tipo) {
    params.set("tipo", filters.tipo);
  }
  if (filters.prioridade) {
    params.set("prioridade", filters.prioridade);
  }
  if (filters.de) {
    params.set("de", filters.de);
  }
  if (filters.ate) {
    params.set("ate", filters.ate);
  }
  if (filters.semResponsavel) {
    params.set("semResponsavel", "true");
  }
  if (filters.page) {
    params.set("page", String(filters.page));
  }
  if (filters.pageSize) {
    params.set("pageSize", String(filters.pageSize));
  }

  const query = params.toString();
  const body = await request(
    `/api/solicitations${query ? `?${query}` : ""}`,
    "Não foi possível carregar as solicitações.",
  );

  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw invalidResponse();
  }
  if (!body.data.every(isSolicitationListItem) || !isPagination(body.pagination)) {
    throw invalidResponse();
  }

  return {
    data: body.data,
    pagination: body.pagination,
  };
}

async function request(
  url: string,
  fallbackMessage: string,
  init: RequestInit = { credentials: "same-origin" },
): Promise<unknown> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {};
    throw new SolicitationApiError(
      response.status,
      typeof error.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error.message === "string" ? error.message : fallbackMessage,
      readFields(error.fields),
    );
  }

  if (!isRecord(body)) {
    throw invalidResponse();
  }
  return body;
}

function readDetail(body: unknown): SolicitationDetail {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw invalidResponse();
  }
  const solicitation = body.data.solicitation;
  if (!isSolicitationDetail(solicitation)) {
    throw invalidResponse();
  }
  return solicitation;
}

function isSolicitationDetail(
  value: unknown,
): value is SolicitationDetail {
  return (
    isRecord(value) &&
    typeof value.descricaoProblema === "string" &&
    (typeof value.observacoes === "string" || value.observacoes === null) &&
    isSolicitationListItem(value)
  );
}

function readFields(value: unknown): SolicitationFieldErrors {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function invalidResponse(): SolicitationApiError {
  return new SolicitationApiError(
    200,
    "INVALID_RESPONSE",
    "A resposta do servidor não contém dados válidos da solicitação.",
  );
}

function isSolicitationListItem(
  value: unknown,
): value is SolicitationListItem {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.data === "string" &&
    typeof value.local === "string" &&
    typeof value.tipoProblema === "string" &&
    (typeof value.setorResponsavel === "string" ||
      value.setorResponsavel === null) &&
    typeof value.urgencia === "string" &&
    (typeof value.prioridade === "string" || value.prioridade === null) &&
    typeof value.status === "string" &&
    (typeof value.dataConclusao === "string" || value.dataConclusao === null) &&
    (isSolicitationUser(value.solicitante) || value.solicitante === null) &&
    (isSolicitationUser(value.responsavel) || value.responsavel === null) &&
    (isSolicitationAsset(value.bem) || value.bem === null)
  );
}

function isSolicitationUser(value: unknown): value is SolicitationUser {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fullName === "string"
  );
}

function isSolicitationAsset(value: unknown): value is SolicitationAsset {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.codigoPatrimonial === "string" &&
    typeof value.descricao === "string"
  );
}

function isPagination(value: unknown): value is SolicitationPage["pagination"] {
  return (
    isRecord(value) &&
    typeof value.page === "number" &&
    typeof value.pageSize === "number" &&
    typeof value.totalItems === "number" &&
    typeof value.totalPages === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
