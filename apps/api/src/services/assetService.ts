import type { Asset } from "../entities/Asset.js";
import type {
  AssetChanges,
  AssetRepository,
  NewAsset,
} from "../repositories/assetRepository.js";

export interface AssetService {
  register(asset: NewAsset): Promise<Asset>;
  search(term?: string): Promise<Asset[]>;
  update(id: number, changes: AssetChanges): Promise<Asset | null>;
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

    update(id, changes) {
      return repository.update(id, changes);
    },
  };
}
