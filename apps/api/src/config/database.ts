import "reflect-metadata";
import { DataSource } from "typeorm";
import { AuthSession } from "../entities/AuthSession.js";
import { User } from "../entities/User.js";
import { CreateAuthenticationTables1793847279000 } from "../migrations/1793847279000-CreateAuthenticationTables.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    entities: [User, AuthSession],
    migrations: [CreateAuthenticationTables1793847279000],
    logging: false,
  });
}