import express, { type Express } from "express";
import {
  createHealthRoutes,
  type DatabaseHealthCheck,
} from "./routes/healthRoutes.js";

export function createApp(checkDatabase: DatabaseHealthCheck): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(createHealthRoutes(checkDatabase));

  return app;
}