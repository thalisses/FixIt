import "reflect-metadata";
import { DataSource } from "typeorm";
import { Asset } from "../entities/Asset.js";
import { CreateAssets1793835564779 } from "../migrations/1793835564779-CreateAssets.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    migrationsRun: true,
    entities: [Asset],
    migrations: [CreateAssets1793835564779],
    logging: false,
  });
}
