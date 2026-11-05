import "dotenv/config";
import { createApp } from "./app.js";
import { createDataSource } from "./config/database.js";
import { loadEnvironment } from "./config/env.js";
import { createAssetRepository } from "./repositories/assetRepository.js";
import { createAssetRoutes } from "./routes/assetRoutes.js";
import { createAssetService } from "./services/assetService.js";

const environment = loadEnvironment();
const dataSource = createDataSource(environment.databaseUrl);
let initialization: ReturnType<typeof dataSource.initialize> | undefined;

async function prepareDatabase(): Promise<void> {
  if (!dataSource.isInitialized) {
    initialization ??= dataSource.initialize().finally(() => {
      initialization = undefined;
    });
    await initialization;
  }
}

async function checkDatabase(): Promise<void> {
  await prepareDatabase();
  await dataSource.query("SELECT 1");
}

const assetRoutes = createAssetRoutes(
  createAssetService(createAssetRepository(dataSource)),
);

createApp(checkDatabase, [assetRoutes]).listen(environment.port, "0.0.0.0", () => {
  console.log(`FixIt API listening on port ${environment.port}`);
});

void prepareDatabase().catch((error: unknown) => {
  console.error("Could not prepare the database:", error);
});
