export type EstadoConservacao =
  | "NOVO"
  | "BOM"
  | "REGULAR"
  | "RUIM"
  | "INSERVIVEL";

export interface Asset {
  id: number;
  codigoPatrimonial: string;
  descricao: string;
  localizacao: string;
  estadoConservacao: EstadoConservacao;
  dataAquisicao: string | null;
  garantia: string | null;
}

export interface NewAssetInput {
  codigoPatrimonial: string;
  descricao: string;
  localizacao: string;
  estadoConservacao: EstadoConservacao | "";
  dataAquisicao: string | null;
  garantia: string | null;
}

export interface AssetChanges {
  localizacao: string;
  estadoConservacao: EstadoConservacao;
}

export type AssetFieldErrors = Record<string, string>;

export class AssetApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: AssetFieldErrors = {},
  ) {
    super(message);
    this.name = "AssetApiError";
  }
}

export async function listAssets(busca = ""): Promise<Asset[]> {
  const term = busca.trim();
  const query = term ? `?busca=${encodeURIComponent(term)}` : "";
  const data = await request(
    `/api/assets${query}`,
    { credentials: "same-origin" },
    "Não foi possível carregar os bens.",
  );

  if (!Array.isArray(data) || !data.every(isAsset)) {
    throw invalidResponse();
  }
  return data;
}

export async function createAsset(input: NewAssetInput): Promise<Asset> {
  return readAsset(
    await request(
      "/api/assets",
      jsonRequest("POST", input),
      "Não foi possível cadastrar o bem.",
    ),
  );
}

export async function updateAsset(
  id: number,
  changes: AssetChanges,
): Promise<Asset> {
  return readAsset(
    await request(
      `/api/assets/${encodeURIComponent(id)}`,
      jsonRequest("PATCH", changes),
      "Não foi possível salvar as alterações.",
    ),
  );
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  };
}

async function request(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<unknown> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {};
    throw new AssetApiError(
      response.status,
      typeof error.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error.message === "string" ? error.message : fallbackMessage,
      readFields(error.fields),
    );
  }

  if (!isRecord(body)) {
    throw invalidResponse();
  }
  return body.data;
}

function readAsset(data: unknown): Asset {
  if (!isRecord(data) || !isAsset(data.asset)) {
    throw invalidResponse();
  }
  return data.asset;
}

function readFields(value: unknown): AssetFieldErrors {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function invalidResponse(): AssetApiError {
  return new AssetApiError(
    200,
    "INVALID_RESPONSE",
    "A resposta do servidor não contém dados válidos do bem.",
  );
}

function isAsset(value: unknown): value is Asset {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.codigoPatrimonial === "string" &&
    typeof value.descricao === "string" &&
    typeof value.localizacao === "string" &&
    typeof value.estadoConservacao === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
