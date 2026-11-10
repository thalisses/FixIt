import "reflect-metadata";
import { DataSource } from "typeorm";
import { Asset } from "../entities/Asset.js";
import { AuthSession } from "../entities/AuthSession.js";
import { Solicitation } from "../entities/Solicitation.js";
import { StatusHistory } from "../entities/StatusHistory.js";
import { User } from "../entities/User.js";
import { CreateAssets1793835564779 } from "../migrations/1793835564779-CreateAssets.js";
import { CreateAuthenticationTables1793847279000 } from "../migrations/1793847279000-CreateAuthenticationTables.js";
import { CreateSolicitations1793897712249 } from "../migrations/1793897712249-CreateSolicitations.js";
import { CreateStatusHistory1793969169334 } from "../migrations/1793969169334-CreateStatusHistory.js";
import { AddAssetToSolicitations1793972702308 } from "../migrations/1793972702308-AddAssetToSolicitations.js";
import { AddSolicitationListIndexes1793985000000 } from "../migrations/1793985000000-AddSolicitationListIndexes.js";
import { AddUserSpecialty1794050000000 } from "../migrations/1794050000000-AddUserSpecialty.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    entities: [User, AuthSession, Asset, Solicitation, StatusHistory],
    migrations: [
      CreateAssets1793835564779,
      CreateAuthenticationTables1793847279000,
      CreateSolicitations1793897712249,
      CreateStatusHistory1793969169334,
      AddAssetToSolicitations1793972702308,
      AddSolicitationListIndexes1793985000000,
      AddUserSpecialty1794050000000,
    ],
    logging: false,
  });
}
