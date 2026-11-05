import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { Asset } from "../entities/Asset.js";
import {
  DuplicateCodigoPatrimonialError,
  type AssetRepository,
} from "../repositories/assetRepository.js";
import { createAssetService } from "../services/assetService.js";
import { createAssetRoutes } from "./assetRoutes.js";

let server: Server | undefined;

afterEach(async () => {
  const currentServer = server;
  server = undefined;
  vi.restoreAllMocks();

  if (!currentServer?.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    currentServer.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

function createFakeRepository(): AssetRepository & { assets: Asset[] } {
  const assets: Asset[] = [];

  return {
    assets,
    async create(asset) {
      const exists = assets.some(
        ({ codigoPatrimonial }) => codigoPatrimonial === asset.codigoPatrimonial,
      );
      if (exists) {
        throw new DuplicateCodigoPatrimonialError();
      }

      const saved: Asset = { id: assets.length + 1, ...asset };
      assets.push(saved);
      return saved;
    },
  };
}

async function startServer(repository: AssetRepository): Promise<string> {
  const routes = createAssetRoutes(createAssetService(repository));
  const checkDatabase = async () => undefined;
  server = createApp(checkDatabase, [routes]).listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

function post(baseUrl: string, body: string): Promise<Response> {
  return fetch(`${baseUrl}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const projetor = {
  codigoPatrimonial: "PAT-1",
  descricao: "Projetor Epson",
  localizacao: "Bloco C, sala 12",
  estadoConservacao: "BOM",
};

describe("POST /assets", () => {
  it("registers an asset without the optional dates (CA1)", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await post(baseUrl, JSON.stringify(projetor));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: 1,
      ...projetor,
      dataAquisicao: null,
      garantia: null,
    });
  });

  it("keeps the dates when they are informed", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await post(
      baseUrl,
      JSON.stringify({
        ...projetor,
        dataAquisicao: "2025-03-01",
        garantia: "2027-03-01",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      dataAquisicao: "2025-03-01",
      garantia: "2027-03-01",
    });
  });

  it("refuses an asset code that already exists (CA2)", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);
    await post(baseUrl, JSON.stringify(projetor));

    const response = await post(
      baseUrl,
      JSON.stringify({ ...projetor, codigoPatrimonial: "  PAT-1 " }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Código patrimonial já cadastrado.",
    });
    expect(repository.assets).toHaveLength(1);
  });

  it("lists every missing required field and saves nothing (CA3)", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await post(baseUrl, JSON.stringify({ descricao: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Dados inválidos.",
      fields: {
        codigoPatrimonial: "Código patrimonial é obrigatório.",
        descricao: "Descrição é obrigatória.",
        localizacao: "Localização é obrigatória.",
        estadoConservacao: "Estado de conservação inválido.",
      },
    });
    expect(repository.assets).toHaveLength(0);
  });

  it("refuses a condition outside the fixed list and an impossible date", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await post(
      baseUrl,
      JSON.stringify({
        ...projetor,
        estadoConservacao: "OTIMO",
        garantia: "2026-02-30",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Dados inválidos.",
      fields: {
        estadoConservacao: "Estado de conservação inválido.",
        garantia: "Garantia deve ser uma data válida.",
      },
    });
  });

  it("answers malformed JSON with a generic 400", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await post(baseUrl, "{ quebrado");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Requisição inválida.",
    });
  });

  it("does not expose internal details on an unexpected failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const baseUrl = await startServer({
      create: async () => {
        throw new Error("connection to 10.0.0.5 refused");
      },
    });

    const response = await post(baseUrl, JSON.stringify(projetor));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Erro interno do servidor.",
    });
  });
});
