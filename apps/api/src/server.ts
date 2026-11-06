import "dotenv/config";
import { createApp } from "./app.js";
import { createDataSource } from "./config/database.js";
import { loadEnvironment } from "./config/env.js";
import { AuthSession } from "./entities/AuthSession.js";
import { User } from "./entities/User.js";
import { createAssetRepository } from "./repositories/assetRepository.js";
import { createStatusHistoryRepository } from "./repositories/statusHistoryRepository.js";
import { createUserManagementRepository } from "./repositories/userManagementRepository.js";
import type { SessionRepository } from "./services/sessionService.js";

const environment = loadEnvironment();
const dataSource = createDataSource(environment.databaseUrl);

async function checkDatabase(): Promise<void> {
  await dataSource.query("SELECT 1");
}

async function startServer(): Promise<void> {
  await dataSource.initialize();
  await dataSource.runMigrations();
  const userRepository = dataSource.getRepository(User);
  const authSessionRepository = dataSource.getRepository(AuthSession);
  const sessionRepository: SessionRepository = {
    create: (session) => authSessionRepository.create(session),
    save: (session) => authSessionRepository.save(session),
    findOneByTokenHash: (tokenHash) =>
      authSessionRepository.findOneBy({ tokenHash }),
    findUserById: (userId) => userRepository.findOneBy({ id: userId }),
  };

  createApp(
    checkDatabase,
    userRepository,
    sessionRepository,
    createUserManagementRepository(dataSource),
    {
      secureCookies: environment.isProduction,
      webOrigin: environment.webOrigin,
    },
    createAssetRepository(dataSource),
    createStatusHistoryRepository(dataSource),
  ).listen(
    environment.port,
    "0.0.0.0",
    () => {
      console.log(`FixIt API listening on port ${environment.port}`);
    },
  );
}

await startServer();
