import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { Solicitation } from "../entities/Solicitation.js";
import type { SolicitationService } from "../services/solicitationService.js";
import { solicitationListQuerySchema } from "../validators/solicitationValidators.js";

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
        "Filtros da solicitação inválidos.",
      fields,
    },
  });
}

function toListItem(solicitation: Solicitation) {
  const {
    id,
    data,
    local,
    tipoProblema,
    setorResponsavel,
    urgencia,
    prioridade,
    status,
    dataConclusao,
    solicitante,
    responsavel,
    bem,
  } = solicitation;

  return {
    id,
    data: data.toISOString(),
    local,
    tipoProblema,
    setorResponsavel,
    urgencia,
    prioridade,
    status,
    dataConclusao: dataConclusao ? dataConclusao.toISOString() : null,
    solicitante: solicitante
      ? { id: solicitante.id, fullName: solicitante.fullName }
      : null,
    responsavel: responsavel
      ? { id: responsavel.id, fullName: responsavel.fullName }
      : null,
    bem: bem
      ? {
          id: bem.id,
          codigoPatrimonial: bem.codigoPatrimonial,
          descricao: bem.descricao,
        }
      : null,
  };
}

export function createSolicitationController(service: SolicitationService) {
  return {
    async list(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const parsed = solicitationListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        sendValidationError(response, parsed.error);
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
        const { solicitations, totalItems } = await service.list(
          parsed.data,
          user,
        );
        const page = parsed.data.page ?? 1;
        const pageSize = parsed.data.pageSize ?? 20;

        response.status(200).json({
          data: solicitations.map(toListItem),
          pagination: {
            page,
            pageSize,
            totalItems,
            totalPages: Math.ceil(totalItems / pageSize),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
