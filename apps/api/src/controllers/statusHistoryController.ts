import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { StatusHistory } from "../entities/StatusHistory.js";
import type { StatusHistoryService } from "../services/statusHistoryService.js";
import { idParamSchema } from "../validators/idParamSchema.js";

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
        const { fieldErrors } = z.flattenError(parsed.error);
        const message = fieldErrors.id?.at(0) ?? "Identificador inválido.";
        response.status(422).json({
          error: { code: "VALIDATION_ERROR", message, fields: { id: message } },
        });
        return;
      }

      try {
        const history = await service.listBySolicitation(parsed.data.id);
        if (!history) {
          response.status(404).json({
            error: {
              code: "SOLICITATION_NOT_FOUND",
              message: "Solicitação não encontrada.",
            },
          });
          return;
        }

        response.status(200).json({ data: history.map(toHistoryEntry) });
      } catch (error) {
        next(error);
      }
    },
  };
}
