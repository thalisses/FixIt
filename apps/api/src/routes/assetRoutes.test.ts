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
