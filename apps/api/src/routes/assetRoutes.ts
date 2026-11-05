import { Router } from "express";
import { createAssetController } from "../controllers/assetController.js";
import type { AssetService } from "../services/assetService.js";

export function createAssetRoutes(service: AssetService): Router {
  const router = Router();
  const controller = createAssetController(service);

  router.post("/api/assets", controller.create);

  return router;
}
