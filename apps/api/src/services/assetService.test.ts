import { describe, expect, it } from "vitest";
import { EstadoConservacao, type Asset } from "../entities/Asset.js";
import {
  DuplicateCodigoPatrimonialError,
  type AssetRepository,
  type NewAsset,
} from "../repositories/assetRepository.js";
import { createAssetService } from "./assetService.js";

function createFakeRepository(): AssetRepository {
  const assets: Asset[] = [];

  return {
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

const projetor: NewAsset = {
  codigoPatrimonial: "PAT-1",
  descricao: "Projetor Epson",
  localizacao: "Bloco C, sala 12",
  estadoConservacao: EstadoConservacao.BOM,
  dataAquisicao: null,
  garantia: null,
};

describe("asset service", () => {
  it("registers an asset", async () => {
    const service = createAssetService(createFakeRepository());

    const saved = await service.register(projetor);

    expect(saved).toEqual({ id: 1, ...projetor });
  });

  it("removes spaces around the asset code", async () => {
    const service = createAssetService(createFakeRepository());

    const saved = await service.register({
      ...projetor,
      codigoPatrimonial: "  PAT-1  ",
    });

    expect(saved.codigoPatrimonial).toBe("PAT-1");
  });

  it("refuses an asset code that already exists", async () => {
    const service = createAssetService(createFakeRepository());
    await service.register(projetor);

    await expect(
      service.register({ ...projetor, codigoPatrimonial: " PAT-1 " }),
    ).rejects.toBeInstanceOf(DuplicateCodigoPatrimonialError);
  });
});
