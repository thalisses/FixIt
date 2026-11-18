import type { NextFunction, Request, Response } from "express";
import {
  ReportAccessDeniedError,
  type ReportService,
} from "../services/reportService.js";

export function createReportController(service: ReportService) {
  return {
    async maintenance(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const user = request.authUser;
      if (!user) {
        response.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "Autenticação necessária.",
          },
        });
        return;
      }

      try {
        const report = await service.getMaintenanceReport(user);
        response.status(200).json({ data: report });
      } catch (error) {
        if (error instanceof ReportAccessDeniedError) {
          response.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: error.message,
            },
          });
          return;
        }
        next(error);
      }
    },
  };
}
