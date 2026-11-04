import { Router } from "express";

export type DatabaseHealthCheck = () => Promise<void>;

export function createHealthRoutes(checkDatabase: DatabaseHealthCheck): Router {
  const router = Router();

  router.get("/health/live", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  router.get("/health/ready", (_request, response) => {
    void checkDatabase().then(
      () => {
        response.status(200).json({ status: "ok", database: "ok" });
      },
      () => {
        response.status(503).json({
          status: "error",
          database: "unavailable",
        });
      },
    );
  });

  return router;
}