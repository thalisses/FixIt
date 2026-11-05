import "reflect-metadata";
import { DataSource } from "typeorm";
import { Asset } from "../entities/Asset.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User } from "../entities/User.js";
import { CreateAssets1793835564779 } from "../migrations/1793835564779-CreateAssets.js";
import { CreateAuthenticationTables1793847279000 } from "../migrations/1793847279000-CreateAuthenticationTables.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    entities: [User, AuthSession, Asset],
    migrations: [
      CreateAssets1793835564779,
      CreateAuthenticationTables1793847279000,
    ],
    logging: false,
  });
}
