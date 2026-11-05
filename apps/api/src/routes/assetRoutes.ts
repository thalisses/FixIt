import { Router } from "express";
import { createAssetController } from "../controllers/assetController.js";
import { UserRole } from "../entities/User.js";
import { createCsrfMiddleware } from "../middleware/csrf.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import { createRequireRole } from "../middleware/requireRole.js";
import type { AssetService } from "../services/assetService.js";
import type { SessionService } from "../services/sessionService.js";

export function createAssetRoutes(
  service: AssetService,
  sessionService: SessionService,
  webOrigin: string,
): Router {
  const router = Router();
  const controller = createAssetController(service);
  const requireAuth = createRequireAuth(sessionService);
  const requireAllowedOrigin = createCsrfMiddleware(webOrigin);
  const requireAssetManager = createRequireRole(
    UserRole.MANUTENTOR,
    UserRole.GESTOR,
  );

  router.get("/api/assets", controller.list);
  router.post(
    "/api/assets",
    requireAuth,
    requireAllowedOrigin,
    requireAssetManager,
    controller.create,
  );
  router.patch("/api/assets/:id", controller.update);

  return router;
}
