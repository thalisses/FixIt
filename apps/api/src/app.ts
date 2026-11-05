import express, { type Express, type Router } from "express";
import {
  createHealthRoutes,
  type DatabaseHealthCheck,
} from "./routes/healthRoutes.js";

export function createApp(
  checkDatabase: DatabaseHealthCheck,
  routers: Router[] = [],
): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(createHealthRoutes(checkDatabase));
  routers.forEach((router) => app.use(router));

  return app;
}
