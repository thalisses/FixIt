import { Router } from "express";
import { createSolicitationController } from "../controllers/solicitationController.js";
import { createCsrfMiddleware } from "../middleware/csrf.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import type { SessionService } from "../services/sessionService.js";
import type { SolicitationService } from "../services/solicitationService.js";

export function createSolicitationRoutes(
  service: SolicitationService,
  sessionService: SessionService,
  webOrigin: string,
  statusEnabled: boolean,
): Router {
  const router = Router();
  const controller = createSolicitationController(service);
  const requireAuth = createRequireAuth(sessionService);
  const requireAllowedOrigin = createCsrfMiddleware(webOrigin);

  router.get("/api/solicitations", requireAuth, controller.list);
  router.get("/api/solicitations/:id", requireAuth, controller.get);
  if (statusEnabled) {
    router.patch(
      "/api/solicitations/:id/status",
      requireAuth,
      requireAllowedOrigin,
      controller.changeStatus,
    );
  }

  return router;
}
