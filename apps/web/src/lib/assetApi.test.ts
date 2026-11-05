import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssetApiError,
  createAsset,
  listAssets,
  updateAsset,
  type Asset,
} from "./assetApi";

const asset: Asset = {
  id: 1,
  codigoPatrimonial: "PAT-1",
  descricao: "Projetor Epson",
  localizacao: "Bloco C, sala 12",
  estadoConservacao: "BOM",
  dataAquisicao: null,
  garantia: null,
};

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assetApi", () => {
  it("lists assets, encoding the search term", async () => {
    const fetchMock = stubFetch({ data: [asset] });

    await expect(listAssets(" ar & cond ")).resolves.toEqual([asset]);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/assets?busca=ar%20%26%20cond",
    );
  });

  it("does not send an empty search term", async () => {
    const fetchMock = stubFetch({ data: [] });

    await listAssets("   ");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/assets");
  });

  it("creates an asset and reads it from the response", async () => {
    const fetchMock = stubFetch({ data: { asset } }, 201);
    const input = { ...asset, estadoConservacao: "BOM" as const };

    await expect(createAsset(input)).resolves.toEqual(asset);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
  });

  it("updates only the location and the condition", async () => {
    const fetchMock = stubFetch({ data: { asset } });
    const changes = {
      localizacao: "Sala 9",
      estadoConservacao: "RUIM" as const,
    };

    await updateAsset(1, changes);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/assets/1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify(changes),
    });
  });

  it("exposes the code, the message and the field errors of a refusal", async () => {
    stubFetch(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados do bem patrimonial inválidos.",
          fields: { descricao: "Descrição é obrigatória." },
        },
      },
      422,
    );

    const error = await listAssets().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AssetApiError);
    expect(error).toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Dados do bem patrimonial inválidos.",
      fields: { descricao: "Descrição é obrigatória." },
    });
  });

  it("refuses a response without valid assets", async () => {
    stubFetch({ data: [{ id: "x" }] });

    await expect(listAssets()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
