import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { Asset } from "../entities/Asset.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User, UserRole } from "../entities/User.js";
import {
  DuplicateCodigoPatrimonialError,
  type AssetRepository,
} from "../repositories/assetRepository.js";
import type { SessionRepository } from "../services/sessionService.js";
import type { UserManagementRepository } from "../services/userManagementService.js";
import type { UserRepository } from "../services/userService.js";

let server: Server | undefined;

const webOrigin = "http://localhost:5173";
const sessionToken = "a".repeat(43);
const loggedUser = Object.assign(new User(), {
  id: "user-1",
  fullName: "Ana Silva",
  email: "ana@example.edu",
  isActive: true,
  role: UserRole.GESTOR,
});

const userRepository: UserRepository = {
  create: (input) => Object.assign(new User(), input),
  findOneBy: async () => null,
  save: async (user) => user,
};
const sessionRepository: SessionRepository = {
  create: (input) => Object.assign(new AuthSession(), input),
  save: async (session) => session,
  findOneByTokenHash: async () =>
    Object.assign(new AuthSession(), {
      userId: loggedUser.id,
      expiresAt: null,
      revokedAt: null,
    }),
  findUserById: async (userId) => (userId === loggedUser.id ? loggedUser : null),
};
const userManagementRepository: UserManagementRepository = {
  list: async () => ({ users: [], totalItems: 0 }),
  transaction: async <T>() => {
    throw new Error("User management is not used in this test.");
  },
};

beforeEach(() => {
  loggedUser.role = UserRole.GESTOR;
});

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
    async search(term) {
      const text = term?.toLowerCase() ?? "";
      return assets.filter(
        ({ codigoPatrimonial, descricao }) =>
          codigoPatrimonial.toLowerCase().includes(text) ||
          descricao.toLowerCase().includes(text),
      );
    },
    async update(id, changes) {
      const duplicate = assets.some(
        (candidate) =>
          candidate.id !== id &&
          candidate.codigoPatrimonial === changes.codigoPatrimonial,
      );
      if (duplicate) {
        throw new DuplicateCodigoPatrimonialError();
      }

      const asset = assets.find((candidate) => candidate.id === id);
      return asset ? Object.assign(asset, changes) : null;
    },
  };
}

async function startServer(repository: AssetRepository): Promise<string> {
  server = createApp(
    async () => undefined,
    userRepository,
    sessionRepository,
    userManagementRepository,
    { secureCookies: false, webOrigin },
    repository,
  ).listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

const authenticatedHeaders = {
  Cookie: `fixit_session=${sessionToken}`,
  Origin: webOrigin,
};

function post(
  baseUrl: string,
  body: string,
  headers: Record<string, string> = authenticatedHeaders,
): Promise<Response> {
  return fetch(`${baseUrl}/api/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

const projetor = {
  codigoPatrimonial: "PAT-1",
  descricao: "Projetor Epson",
  localizacao: "Bloco C, sala 12",
  estadoConservacao: "BOM",
};

describe("POST /api/assets access", () => {
  it.each([UserRole.GESTOR, UserRole.MANUTENTOR])(
    "lets %s register an asset (CA1)",
    async (role) => {
      loggedUser.role = role;
      const baseUrl = await startServer(createFakeRepository());

      const response = await post(baseUrl, JSON.stringify(projetor));

      expect(response.status).toBe(201);
    },
  );

  it("refuses a Cliente and saves nothing", async () => {
    loggedUser.role = UserRole.CLIENTE;
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await post(baseUrl, JSON.stringify(projetor));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(repository.assets).toHaveLength(0);
  });

  it("refuses a request without a session and saves nothing", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await post(baseUrl, JSON.stringify(projetor), {
      Origin: webOrigin,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
    expect(repository.assets).toHaveLength(0);
  });

  it("refuses a request from another origin and saves nothing", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await post(baseUrl, JSON.stringify(projetor), {
      Cookie: authenticatedHeaders.Cookie,
      Origin: "https://site-malicioso.example",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED" },
    });
    expect(repository.assets).toHaveLength(0);
  });
});

describe("POST /api/assets", () => {
  it("registers an asset without the optional dates (CA1)", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await post(baseUrl, JSON.stringify(projetor));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: {
        asset: { id: 1, ...projetor, dataAquisicao: null, garantia: null },
      },
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
      data: {
        asset: { dataAquisicao: "2025-03-01", garantia: "2027-03-01" },
      },
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
      error: {
        code: "ASSET_CODE_ALREADY_EXISTS",
        message: "Código patrimonial já cadastrado.",
      },
    });
    expect(repository.assets).toHaveLength(1);
  });

  it("lists every missing required field and saves nothing (CA3)", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);

    const response = await post(baseUrl, JSON.stringify({ descricao: "   " }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados do bem patrimonial inválidos.",
        fields: {
          codigoPatrimonial: "Código patrimonial é obrigatório.",
          descricao: "Descrição é obrigatória.",
          localizacao: "Localização é obrigatória.",
          estadoConservacao: "Estado de conservação inválido.",
        },
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

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados do bem patrimonial inválidos.",
        fields: {
          estadoConservacao: "Estado de conservação inválido.",
          garantia: "Garantia deve ser uma data válida.",
        },
      },
    });
  });

  it("answers malformed JSON with the API validation error", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await post(baseUrl, "{ quebrado");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("does not expose internal details on an unexpected failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const baseUrl = await startServer({
      create: async () => {
        throw new Error("connection to 10.0.0.5 refused");
      },
      search: async () => [],
      update: async () => null,
    });

    const response = await post(baseUrl, JSON.stringify(projetor));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Ocorreu um erro interno.",
      },
    });
  });
});

describe("GET /api/assets access", () => {
  it("refuses a request without a session", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await fetch(`${baseUrl}/api/assets`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("gives a Cliente only the fields needed to pick an asset", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));
    loggedUser.role = UserRole.CLIENTE;

    const response = await fetch(`${baseUrl}/api/assets`, {
      headers: authenticatedHeaders,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 1,
          codigoPatrimonial: projetor.codigoPatrimonial,
          descricao: projetor.descricao,
        },
      ],
    });
  });

  it("lets a Cliente search by code", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));
    loggedUser.role = UserRole.CLIENTE;

    const response = await fetch(`${baseUrl}/api/assets?busca=pat-1`, {
      headers: authenticatedHeaders,
    });

    await expect(response.json()).resolves.toMatchObject({
      data: [{ codigoPatrimonial: projetor.codigoPatrimonial }],
    });
  });

  it.each([UserRole.GESTOR, UserRole.MANUTENTOR])(
    "gives %s all the fields",
    async (role) => {
      const baseUrl = await startServer(createFakeRepository());
      await post(baseUrl, JSON.stringify(projetor));
      loggedUser.role = role;

      const response = await fetch(`${baseUrl}/api/assets`, {
        headers: authenticatedHeaders,
      });

      await expect(response.json()).resolves.toEqual({
        data: [{ id: 1, ...projetor, dataAquisicao: null, garantia: null }],
      });
    },
  );
});

describe("GET /api/assets", () => {
  it("answers an empty list when nothing is registered", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await fetch(`${baseUrl}/api/assets`, {
      headers: authenticatedHeaders,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
  });

  it("shows a registered asset in the list (US004 CA1)", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await fetch(`${baseUrl}/api/assets`, {
      headers: authenticatedHeaders,
    });

    await expect(response.json()).resolves.toMatchObject({
      data: [{ codigoPatrimonial: "PAT-1" }],
    });
  });

  it("searches by code or description, ignoring surrounding spaces (CA1)", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));
    await post(
      baseUrl,
      JSON.stringify({
        ...projetor,
        codigoPatrimonial: "PAT-2",
        descricao: "Notebook Dell",
      }),
    );

    const byDescription = await fetch(`${baseUrl}/api/assets?busca=%20dell%20`, {
      headers: authenticatedHeaders,
    });
    const byCode = await fetch(`${baseUrl}/api/assets?busca=pat-1`, {
      headers: authenticatedHeaders,
    });

    await expect(byDescription.json()).resolves.toMatchObject({
      data: [{ codigoPatrimonial: "PAT-2" }],
    });
    await expect(byCode.json()).resolves.toMatchObject({
      data: [{ codigoPatrimonial: "PAT-1" }],
    });
  });

  it("refuses a repeated search parameter", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await fetch(`${baseUrl}/api/assets?busca=a&busca=b`, {
      headers: authenticatedHeaders,
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados do bem patrimonial inválidos.",
        fields: { busca: "Busca inválida." },
      },
    });
  });
});

describe("PATCH /api/assets/:id", () => {
  function patch(
    baseUrl: string,
    id: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = authenticatedHeaders,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it.each([UserRole.GESTOR, UserRole.MANUTENTOR])(
    "lets %s edit an asset",
    async (role) => {
      const baseUrl = await startServer(createFakeRepository());
      await post(baseUrl, JSON.stringify(projetor));
      loggedUser.role = role;

      const response = await patch(baseUrl, "1", { localizacao: "Sala 9" });

      expect(response.status).toBe(200);
    },
  );

  it("refuses a Cliente and keeps the asset unchanged", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);
    await post(baseUrl, JSON.stringify(projetor));
    loggedUser.role = UserRole.CLIENTE;

    const response = await patch(baseUrl, "1", { localizacao: "Sala 9" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(repository.assets[0]?.localizacao).toBe(projetor.localizacao);
  });

  it("refuses an edit without a session and keeps the asset unchanged", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(
      baseUrl,
      "1",
      { localizacao: "Sala 9" },
      { Origin: webOrigin },
    );

    expect(response.status).toBe(401);
    expect(repository.assets[0]?.localizacao).toBe(projetor.localizacao);
  });

  it("refuses an edit from another origin and keeps the asset unchanged", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(
      baseUrl,
      "1",
      { localizacao: "Sala 9" },
      {
        Cookie: authenticatedHeaders.Cookie,
        Origin: "https://site-malicioso.example",
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED" },
    });
    expect(repository.assets[0]?.localizacao).toBe(projetor.localizacao);
  });

  it("changes the location and the condition (CA2)", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", {
      localizacao: "Bloco A, sala 3",
      estadoConservacao: "RUIM",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        asset: {
          id: 1,
          codigoPatrimonial: "PAT-1",
          localizacao: "Bloco A, sala 3",
          estadoConservacao: "RUIM",
        },
      },
    });
  });

  it("keeps the fields that were not sent", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", { estadoConservacao: "REGULAR" });

    await expect(response.json()).resolves.toMatchObject({
      data: {
        asset: {
          localizacao: projetor.localizacao,
          estadoConservacao: "REGULAR",
        },
      },
    });
  });

  it("ignores the id and unknown fields", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", {
      id: 99,
      naoExiste: "x",
      localizacao: "Sala 9",
    });

    await expect(response.json()).resolves.toEqual({
      data: {
        asset: {
          id: 1,
          ...projetor,
          localizacao: "Sala 9",
          dataAquisicao: null,
          garantia: null,
        },
      },
    });
  });

  it("corrects the code, the description and the dates", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", {
      codigoPatrimonial: "  PAT-1A ",
      descricao: "Projetor Epson X05",
      dataAquisicao: "2025-03-01",
      garantia: "2027-03-01",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        asset: {
          codigoPatrimonial: "PAT-1A",
          descricao: "Projetor Epson X05",
          localizacao: projetor.localizacao,
          dataAquisicao: "2025-03-01",
          garantia: "2027-03-01",
        },
      },
    });
  });

  it("clears an optional date sent as null and keeps the other one", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(
      baseUrl,
      JSON.stringify({
        ...projetor,
        dataAquisicao: "2025-03-01",
        garantia: "2027-03-01",
      }),
    );

    const response = await patch(baseUrl, "1", { garantia: null });

    await expect(response.json()).resolves.toMatchObject({
      data: { asset: { dataAquisicao: "2025-03-01", garantia: null } },
    });
  });

  it("refuses the code of another asset and keeps the asset unchanged", async () => {
    const repository = createFakeRepository();
    const baseUrl = await startServer(repository);
    await post(baseUrl, JSON.stringify(projetor));
    await post(
      baseUrl,
      JSON.stringify({ ...projetor, codigoPatrimonial: "PAT-2" }),
    );

    const response = await patch(baseUrl, "2", {
      codigoPatrimonial: "PAT-1",
      descricao: "Outra",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ASSET_CODE_ALREADY_EXISTS",
        message: "Código patrimonial já cadastrado.",
      },
    });
    expect(repository.assets[1]?.codigoPatrimonial).toBe("PAT-2");
    expect(repository.assets[1]?.descricao).toBe(projetor.descricao);
  });

  it("accepts the code the asset already has", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", {
      codigoPatrimonial: "PAT-1",
      descricao: "Outra",
    });

    expect(response.status).toBe(200);
  });

  it.each([
    ["codigoPatrimonial", "Código patrimonial é obrigatório."],
    ["descricao", "Descrição é obrigatória."],
  ])("refuses a blank %s", async (field, message) => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", { [field]: "   " });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { fields: { [field]: message } },
    });
  });

  it("refuses an impossible date", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", { garantia: "2026-02-30" });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { fields: { garantia: "Garantia deve ser uma data válida." } },
    });
  });

  it("answers 404 for an asset that does not exist", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await patch(baseUrl, "99", { localizacao: "Sala 9" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ASSET_NOT_FOUND",
        message: "Bem patrimonial não encontrado.",
      },
    });
  });

  it("refuses an invalid id", async () => {
    const baseUrl = await startServer(createFakeRepository());

    const response = await patch(baseUrl, "abc", { localizacao: "Sala 9" });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados do bem patrimonial inválidos.",
        fields: { id: "Identificador inválido." },
      },
    });
  });

  it("refuses an edit without any supported field", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", { naoExiste: "x" });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Informe ao menos um campo para alterar.",
        fields: {},
      },
    });
  });

  it("refuses a blank location and a condition outside the list", async () => {
    const baseUrl = await startServer(createFakeRepository());
    await post(baseUrl, JSON.stringify(projetor));

    const response = await patch(baseUrl, "1", {
      localizacao: "  ",
      estadoConservacao: "OTIMO",
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados do bem patrimonial inválidos.",
        fields: {
          localizacao: "Localização é obrigatória.",
          estadoConservacao: "Estado de conservação inválido.",
        },
      },
    });
  });
});
