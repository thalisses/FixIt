import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  ReportAccessDeniedError,
  type ReportService,
} from "../services/reportService.js";
import { reportQuerySchema } from "../validators/reportValidators.js";

function sendValidationError(response: Response, error: z.ZodError): void {
  const { fieldErrors, formErrors } = z.flattenError(error);
  const fields = Object.fromEntries(
    Object.entries(fieldErrors).map(([field, messages]) => [
      field,
      (messages as string[] | undefined)?.at(0),
    ]),
  );
  response.status(422).json({
    error: {
      code: "VALIDATION_ERROR",
      message:
        formErrors.at(0) ??
        Object.values(fields).at(0) ??
        "Filtros do relatório inválidos.",
      fields,
    },
  });
}

export function createReportController(service: ReportService) {
  return {
    async maintenance(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const query = reportQuerySchema.safeParse(request.query);
      if (!query.success) {
        sendValidationError(response, query.error);
        return;
      }

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
        const report = await service.getMaintenanceReport(user, query.data);
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
