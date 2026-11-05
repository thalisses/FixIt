import { config } from "dotenv";
import { createDataSource } from "./database.js";
import { loadEnvironment } from "./env.js";

// Usado apenas pela CLI do TypeORM, que roda a partir de apps/api.
config({ path: "../../.env" });

export default createDataSource(loadEnvironment().databaseUrl);
