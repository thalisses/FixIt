import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { StatusHistory } from "../entities/StatusHistory.js";
import {
  HistoryAccessDeniedError,
  NotResponsibleError,
  SolicitationClosedError,
  SolicitationNotFoundError,
  type StatusHistoryService,
} from "../services/statusHistoryService.js";
import { idParamSchema } from "../validators/idParamSchema.js";
import { observationSchema } from "../validators/statusHistoryValidators.js";

function sendValidationError(
  response: Response,
  error: z.ZodError,
  fallbackMessage: string,
): void {
  const { fieldErrors, formErrors } = z.flattenError(error);
  const fields = Object.fromEntries(
    Object.entries(fieldErrors).map(([field, messages]) => [
      field,
      (messages as string[] | undefined)?.at(0),
    ]),
  );
  const message =
    formErrors.at(0) ?? Object.values(fields).at(0) ?? fallbackMessage;
  response.status(422).json({
    error: { code: "VALIDATION_ERROR", message, fields },
  });
}

function sendSolicitationNotFound(response: Response): void {
  response.status(404).json({
    error: {
      code: "SOLICITATION_NOT_FOUND",
      message: "Solicitação não encontrada.",
    },
  });
}

function toHistoryEntry({
  id,
  tipo,
  statusAnterior,
  statusNovo,
  descricao,
  dataHora,
  autor,
}: StatusHistory) {
  return {
    id,
    tipo,
    statusAnterior,
    statusNovo,
    descricao,
    dataHora,
    autor: { id: autor.id, fullName: autor.fullName },
  };
}

export function createStatusHistoryController(service: StatusHistoryService) {
  return {
    async list(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) {
        sendValidationError(response, parsed.error, "Identificador inválido.");
        return;
      }

      const viewer = request.authUser;
      if (!viewer) {
        next(new Error("Authenticated user missing on a protected route."));
        return;
      }

      try {
        const history = await service.listBySolicitation(
          parsed.data.id,
          viewer,
        );
        if (!history) {
          sendSolicitationNotFound(response);
          return;
        }

        response.status(200).json({ data: history.map(toHistoryEntry) });
      } catch (error) {
        if (error instanceof HistoryAccessDeniedError) {
          response.status(403).json({
            error: { code: "FORBIDDEN", message: error.message },
          });
          return;
        }
        next(error);
      }
    },

    async addObservation(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const id = idParamSchema.safeParse(request.params);
      if (!id.success) {
        sendValidationError(response, id.error, "Identificador inválido.");
        return;
      }

      const body = observationSchema.safeParse(request.body);
      if (!body.success) {
        sendValidationError(
          response,
          body.error,
          "Dados da observação inválidos.",
        );
        return;
      }

      const author = request.authUser;
      if (!author) {
        next(new Error("Authenticated user missing on a protected route."));
        return;
      }

      try {
        const entry = await service.addObservation({
          solicitacaoId: id.data.id,
          autorId: author.id,
          descricao: body.data.descricao,
        });
        response.status(201).json({
          data: {
            observation: toHistoryEntry(
              Object.assign(entry, {
                autor: { id: author.id, fullName: author.fullName },
              }),
            ),
          },
        });
      } catch (error) {
        if (error instanceof SolicitationNotFoundError) {
          sendSolicitationNotFound(response);
          return;
        }
        if (error instanceof NotResponsibleError) {
          response.status(403).json({
            error: { code: "NOT_RESPONSIBLE", message: error.message },
          });
          return;
        }
        if (error instanceof SolicitationClosedError) {
          response.status(409).json({
            error: { code: "SOLICITATION_CLOSED", message: error.message },
          });
          return;
        }
        next(error);
      }
    },
  };
}
