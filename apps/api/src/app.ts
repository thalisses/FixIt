import express, { type ErrorRequestHandler, type Express } from "express";
import type { AssetRepository } from "./repositories/assetRepository.js";
import { createAssetRoutes } from "./routes/assetRoutes.js";
import {
  createHealthRoutes,
  type DatabaseHealthCheck,
} from "./routes/healthRoutes.js";
import { createUserRoutes } from "./routes/userRoutes.js";
import { createUserManagementRoutes } from "./routes/userManagementRoutes.js";
import type { StatusHistoryRepository } from "./repositories/statusHistoryRepository.js";
import { createStatusHistoryRoutes } from "./routes/statusHistoryRoutes.js";
import { createAssetService } from "./services/assetService.js";
import { createStatusHistoryService } from "./services/statusHistoryService.js";
import {
  createUserService,
  type UserRepository,
} from "./services/userService.js";
import { createSessionRoutes } from "./routes/sessionRoutes.js";
import { createAuthenticationService } from "./services/authService.js";
import {
  createSessionService,
  type SessionRepository,
} from "./services/sessionService.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import {
  createUserManagementService,
  type UserManagementRepository,
} from "./services/userManagementService.js";

export function createApp(
  checkDatabase: DatabaseHealthCheck,
  userRepository: UserRepository,
  sessionRepository: SessionRepository,
  userManagementRepository: UserManagementRepository,
  options: { secureCookies: boolean; webOrigin: string },
  assetRepository?: AssetRepository,
  statusHistoryRepository?: StatusHistoryRepository,
): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(createCorsMiddleware(options.webOrigin));
  app.use(express.json());
  app.use(createHealthRoutes(checkDatabase));
  app.use(createUserRoutes(createUserService(userRepository)));
  const sessionService = createSessionService(sessionRepository);
  app.use(
    createUserManagementRoutes(
      createUserManagementService(userManagementRepository),
      sessionService,
      options.webOrigin,
    ),
  );
  app.use(
    createSessionRoutes(
      createAuthenticationService(userRepository),
      sessionService,
      options,
    ),
  );
  if (assetRepository) {
    app.use(
      createAssetRoutes(
        createAssetService(assetRepository),
        sessionService,
        options.webOrigin,
      ),
    );
  }
  if (statusHistoryRepository) {
    app.use(
      createStatusHistoryRoutes(
        createStatusHistoryService(statusHistoryRepository),
        sessionService,
        options.webOrigin,
      ),
    );
  }
  app.use(apiErrorHandler);

  return app;
}

const apiErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isMalformedJson(error)) {
    response.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados de cadastro inválidos.",
      },
    });
    return;
  }

  console.error("API request failed", error);
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Ocorreu um erro interno.",
    },
  });
};

function isMalformedJson(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}
