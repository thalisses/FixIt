import { Router } from "express";
import { createStatusHistoryController } from "../controllers/statusHistoryController.js";
import { UserRole } from "../entities/User.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import { createRequireRole } from "../middleware/requireRole.js";
import type { SessionService } from "../services/sessionService.js";
import type { StatusHistoryService } from "../services/statusHistoryService.js";

export function createStatusHistoryRoutes(
  service: StatusHistoryService,
  sessionService: SessionService,
): Router {
  const router = Router();
  const controller = createStatusHistoryController(service);
  const requireAuth = createRequireAuth(sessionService);
  const requireStaff = createRequireRole(UserRole.MANUTENTOR, UserRole.GESTOR);

  router.get(
    "/api/solicitations/:id/history",
    requireAuth,
    requireStaff,
    controller.list,
  );

  return router;
}
