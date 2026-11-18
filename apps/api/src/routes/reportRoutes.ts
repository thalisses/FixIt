import { Router } from "express";
import { createReportController } from "../controllers/reportController.js";
import { UserRole } from "../entities/User.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import { createRequireRole } from "../middleware/requireRole.js";
import type { ReportService } from "../services/reportService.js";
import type { SessionService } from "../services/sessionService.js";

export function createReportRoutes(
  service: ReportService,
  sessionService: SessionService,
): Router {
  const router = Router();
  const controller = createReportController(service);
  const requireAuth = createRequireAuth(sessionService);
  const requireManager = createRequireRole(UserRole.GESTOR);

  router.get(
    "/api/reports/maintenance",
    requireAuth,
    requireManager,
    controller.maintenance,
  );

  return router;
}
