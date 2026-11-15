import { Router } from "express";
import { createSolicitationAttachmentController } from "../controllers/solicitationAttachmentController.js";
import { createCsrfMiddleware } from "../middleware/csrf.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import type { SessionService } from "../services/sessionService.js";
import type { SolicitationAttachmentService } from "../services/solicitationAttachmentService.js";

export function createSolicitationAttachmentRoutes(
  service: SolicitationAttachmentService, sessionService: SessionService, webOrigin: string,
): Router {
  const router = Router();
  const controller = createSolicitationAttachmentController(service);
  const requireAuth = createRequireAuth(sessionService);
  router.use("/api/solicitations/:id/attachments", (_request, response, next) => {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  router.post("/api/solicitations/:id/attachments", requireAuth, createCsrfMiddleware(webOrigin), controller.upload);
  router.get("/api/solicitations/:id/attachments", requireAuth, controller.list);
  router.get("/api/solicitations/:id/attachments/:attachmentId/content", requireAuth, controller.content);
  return router;
}
