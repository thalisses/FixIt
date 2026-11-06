import type { Asset } from "../entities/Asset.js";
import type { Solicitation } from "../entities/Solicitation.js";
import type {
  AssetChanges,
  AssetRepository,
  NewAsset,
} from "../repositories/assetRepository.js";

export interface AssetService {
  register(asset: NewAsset): Promise<Asset>;
  search(term?: string): Promise<Asset[]>;
  update(id: number, changes: AssetChanges): Promise<Asset | null>;
  listSolicitations(id: number): Promise<Solicitation[] | null>;
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

    listSolicitations(id) {
      return repository.findSolicitations(id);
    },
  };
}
