import "reflect-metadata";
import { DataSource } from "typeorm";
import { Asset } from "../entities/Asset.js";
import { AuthSession } from "../entities/AuthSession.js";
import { Solicitation } from "../entities/Solicitation.js";
import { User } from "../entities/User.js";
import { CreateAssets1793835564779 } from "../migrations/1793835564779-CreateAssets.js";
import { CreateAuthenticationTables1793847279000 } from "../migrations/1793847279000-CreateAuthenticationTables.js";
import { CreateSolicitations1793897712249 } from "../migrations/1793897712249-CreateSolicitations.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    entities: [User, AuthSession, Asset, Solicitation],
    migrations: [
      CreateAssets1793835564779,
      CreateAuthenticationTables1793847279000,
      CreateSolicitations1793897712249,
    ],
    logging: false,
  });
}
