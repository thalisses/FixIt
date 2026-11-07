import { Router } from "express";
import { createSolicitationController } from "../controllers/solicitationController.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import type { SessionService } from "../services/sessionService.js";
import type { SolicitationService } from "../services/solicitationService.js";

export function createSolicitationRoutes(
  service: SolicitationService,
  sessionService: SessionService,
): Router {
  const router = Router();
  const controller = createSolicitationController(service);
  const requireAuth = createRequireAuth(sessionService);

  router.get("/api/solicitations", requireAuth, controller.list);

  return router;
}
