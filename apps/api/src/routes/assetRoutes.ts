import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createAssetController } from "../controllers/assetController.js";
import type { AssetService } from "../services/assetService.js";

function handleAssetRouteError(
  error: { status?: number },
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const status = error.status ?? 500;
  if (status >= 400 && status < 500) {
    response.status(status).json({ error: "Requisição inválida." });
    return;
  }

  console.error("Asset route failed:", error);
  response.status(500).json({ error: "Erro interno do servidor." });
}

export function createAssetRoutes(service: AssetService): Router {
  const router = Router();
  const controller = createAssetController(service);

  router.get("/assets", controller.list, handleAssetRouteError);
  router.post(
    "/assets",
    express.json(),
    controller.create,
    handleAssetRouteError,
  );

  router.patch(
    "/assets/:id",
    express.json(),
    controller.update,
    handleAssetRouteError,
  );

  return router;
}
