import { Router } from "express";
import { createStatusHistoryController } from "../controllers/statusHistoryController.js";
import { UserRole } from "../entities/User.js";
import { createCsrfMiddleware } from "../middleware/csrf.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import { createRequireRole } from "../middleware/requireRole.js";
import type { SessionService } from "../services/sessionService.js";
import type { StatusHistoryService } from "../services/statusHistoryService.js";

export function createStatusHistoryRoutes(
  service: StatusHistoryService,
  sessionService: SessionService,
  webOrigin: string,
): Router {
  const router = Router();
  const controller = createStatusHistoryController(service);
  const requireAuth = createRequireAuth(sessionService);
  const requireStaff = createRequireRole(UserRole.MANUTENTOR, UserRole.GESTOR);
  const requireAllowedOrigin = createCsrfMiddleware(webOrigin);

  router.get(
    "/api/solicitations/:id/history",
    requireAuth,
    requireStaff,
    controller.list,
  );
  // Quem pode gravar é decidido pelo service: só o responsável (US017 CA1).
  router.post(
    "/api/solicitations/:id/observations",
    requireAuth,
    requireAllowedOrigin,
    controller.addObservation,
  );

  return router;
}
