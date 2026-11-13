import { Router } from "express";
import { createSolicitationController } from "../controllers/solicitationController.js";
import { UserRole } from "../entities/User.js";
import { createCsrfMiddleware } from "../middleware/csrf.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import { createRequireRole } from "../middleware/requireRole.js";
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
  const requireManager = createRequireRole(UserRole.GESTOR);

  router.get("/api/solicitations", requireAuth, controller.list);
  router.get(
    "/api/solicitations/:id/maintainers",
    requireAuth,
    requireManager,
    controller.listMaintainers,
  );
  router.get("/api/solicitations/:id", requireAuth, controller.get);
  router.patch(
    "/api/solicitations/:id/assignee",
    requireAuth,
    requireAllowedOrigin,
    requireManager,
    controller.assignMaintainer,
  );
  router.patch(
    "/api/solicitations/:id/priority",
    requireAuth,
    requireAllowedOrigin,
    requireManager,
    controller.changePriority,
  );
  router.post(
    "/api/solicitations/:id/cancel",
    requireAuth,
    requireAllowedOrigin,
    requireManager,
    controller.cancel,
  );
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
