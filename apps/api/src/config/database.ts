import "reflect-metadata";
import { DataSource } from "typeorm";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    entities: [],
    migrations: [],
    logging: false,
  });
}