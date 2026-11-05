import { Router } from "express";
import { createAssetController } from "../controllers/assetController.js";
import type { AssetService } from "../services/assetService.js";

export function createAssetRoutes(service: AssetService): Router {
  const router = Router();
  const controller = createAssetController(service);

  router.get("/api/assets", controller.list);
  router.post("/api/assets", controller.create);
  router.patch("/api/assets/:id", controller.update);

  return router;
}
