import { ILike, QueryFailedError, type DataSource } from "typeorm";
import { Asset, type EstadoConservacao } from "../entities/Asset.js";
import { Solicitation } from "../entities/Solicitation.js";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export interface NewAsset {
  codigoPatrimonial: string;
  descricao: string;
  localizacao: string;
  estadoConservacao: EstadoConservacao;
  dataAquisicao: string | null;
  garantia: string | null;
}

export type AssetChanges = Partial<NewAsset>;

export interface AssetRepository {
  create(asset: NewAsset): Promise<Asset>;
  search(term?: string): Promise<Asset[]>;
  update(id: number, changes: AssetChanges): Promise<Asset | null>;
  /**
   * Solicitações ligadas ao bem, da mais antiga para a mais recente.
   * Devolve null quando o bem não existe.
   */
  findSolicitations(id: number): Promise<Solicitation[] | null>;
}

export class DuplicateCodigoPatrimonialError extends Error {
  constructor() {
    super("Código patrimonial já cadastrado.");
    this.name = "DuplicateCodigoPatrimonialError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const { code } = error.driverError as { code?: string };
  return code === POSTGRES_UNIQUE_VIOLATION;
}

export function createAssetRepository(dataSource: DataSource): AssetRepository {
  const repository = dataSource.getRepository(Asset);

  async function save(asset: Asset): Promise<Asset> {
    try {
      return await repository.save(asset);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateCodigoPatrimonialError();
      }

      throw error;
    }
  }

  return {
    create(asset) {
      return save(repository.create(asset));
    },

    search(term) {
      if (!term) {
        return repository.find({ order: { codigoPatrimonial: "ASC" } });
      }

      const pattern = ILike(`%${term.replace(/[\\%_]/g, "\\$&")}%`);
      return repository.find({
        where: [{ codigoPatrimonial: pattern }, { descricao: pattern }],
        order: { codigoPatrimonial: "ASC" },
      });
    },

    async update(id, changes) {
      const asset = await repository.findOneBy({ id });
      if (!asset) {
        return null;
      }

      return save(repository.merge(asset, changes));
    },

    async findSolicitations(id) {
      if (!(await repository.existsBy({ id }))) {
        return null;
      }

      return dataSource.getRepository(Solicitation).find({
        where: { bemId: id },
        order: { data: "ASC", id: "ASC" },
      });
    },
  };
}
