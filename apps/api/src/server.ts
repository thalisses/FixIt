import "dotenv/config";
import { createApp } from "./app.js";
import { createDataSource } from "./config/database.js";
import { loadEnvironment } from "./config/env.js";

const environment = loadEnvironment();
const dataSource = createDataSource(environment.databaseUrl);
let initialization: ReturnType<typeof dataSource.initialize> | undefined;

async function checkDatabase(): Promise<void> {
  if (!dataSource.isInitialized) {
    initialization ??= dataSource.initialize().finally(() => {
      initialization = undefined;
    });
    await initialization;
  }

  await dataSource.query("SELECT 1");
}

createApp(checkDatabase).listen(environment.port, "0.0.0.0", () => {
  console.log(`FixIt API listening on port ${environment.port}`);
});