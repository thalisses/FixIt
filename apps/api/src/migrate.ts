import "dotenv/config";
import { createDataSource } from "./config/database.js";
import { loadEnvironment } from "./config/env.js";

const environment = loadEnvironment();
const dataSource = createDataSource(environment.databaseUrl);

try {
  await dataSource.initialize();
  const migrations = await dataSource.runMigrations();
  console.log(`Applied ${migrations.length} database migration(s).`);
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
