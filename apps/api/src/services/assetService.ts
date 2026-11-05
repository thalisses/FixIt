import type { Asset } from "../entities/Asset.js";
import type { AssetRepository, NewAsset } from "../repositories/assetRepository.js";

export interface AssetService {
  register(asset: NewAsset): Promise<Asset>;
  search(term?: string): Promise<Asset[]>;
}

export function createAssetService(repository: AssetRepository): AssetService {
  return {
    register(asset) {
      return repository.create({
        ...asset,
        codigoPatrimonial: asset.codigoPatrimonial.trim(),
      });
    },

    search(term) {
      return repository.search(term);
    },
  };
}
