import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { Solicitation } from "../entities/Solicitation.js";
import {
  ForbiddenSolicitationError,
  InvalidStatusTransitionError,
  type SolicitationService,
} from "../services/solicitationService.js";
import { SolicitationNotFoundError } from "../services/statusHistoryService.js";
import { idParamSchema } from "../validators/idParamSchema.js";
import {
  changeSolicitationStatusSchema,
  solicitationListQuerySchema,
} from "../validators/solicitationValidators.js";

function sendValidationError(
  response: Response,
  error: z.ZodError,
  fallbackMessage = "Filtros da solicitação inválidos.",
): void {
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
        fallbackMessage,
      fields,
    },
  });
}

function toDetail(solicitation: Solicitation) {
  return {
    ...toListItem(solicitation),
    descricaoProblema: solicitation.descricaoProblema,
    observacoes: solicitation.observacoes,
  };
}

function sendNotFound(response: Response): void {
  response.status(404).json({
    error: {
      code: "SOLICITATION_NOT_FOUND",
      message: "Solicitação não encontrada.",
    },
  });
}

function sendForbidden(response: Response): void {
  response.status(403).json({
    error: {
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar esta solicitação.",
    },
  });
}

function sendInvalidTransition(response: Response): void {
  response.status(409).json({
    error: {
      code: "INVALID_STATUS_TRANSITION",
      message: "Esta transição de status não é permitida.",
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

    async get(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const id = idParamSchema.safeParse(request.params);
      if (!id.success) {
        sendValidationError(response, id.error, "Identificador inválido.");
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
        const solicitation = await service.get(id.data.id, user);
        response.status(200).json({ data: { solicitation: toDetail(solicitation) } });
      } catch (error) {
        if (error instanceof SolicitationNotFoundError) {
          sendNotFound(response);
          return;
        }
        if (error instanceof ForbiddenSolicitationError) {
          sendForbidden(response);
          return;
        }
        next(error);
      }
    },

    async changeStatus(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const id = idParamSchema.safeParse(request.params);
      if (!id.success) {
        sendValidationError(response, id.error, "Identificador inválido.");
        return;
      }

      const body = changeSolicitationStatusSchema.safeParse(request.body);
      if (!body.success) {
        sendValidationError(
          response,
          body.error,
          "Dados da mudança de status inválidos.",
        );
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
        const solicitation = await service.changeStatus(
          id.data.id,
          body.data.status,
          user,
        );
        response
          .status(200)
          .json({ data: { solicitation: toDetail(solicitation) } });
      } catch (error) {
        if (error instanceof SolicitationNotFoundError) {
          sendNotFound(response);
          return;
        }
        if (error instanceof ForbiddenSolicitationError) {
          sendForbidden(response);
          return;
        }
        if (error instanceof InvalidStatusTransitionError) {
          sendInvalidTransition(response);
          return;
        }
        next(error);
      }
    },
  };
}
