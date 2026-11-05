import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { getAssetSelectionVisibility } from "../auth/authorization.js";
import type { Asset } from "../entities/Asset.js";
import { DuplicateCodigoPatrimonialError } from "../repositories/assetRepository.js";
import type { AssetService } from "../services/assetService.js";
import {
  assetChangesSchema,
  assetIdSchema,
  assetSearchSchema,
  newAssetSchema,
} from "../validators/assetValidators.js";

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
      message: formErrors.at(0) ?? "Dados do bem patrimonial inválidos.",
      fields,
    },
  });
}

function toMinimalAsset({ id, codigoPatrimonial, descricao }: Asset) {
  return { id, codigoPatrimonial, descricao };
}

export function createAssetController(service: AssetService) {
  return {
    async list(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const parsed = assetSearchSchema.safeParse(request.query);
      if (!parsed.success) {
        sendValidationError(response, parsed.error);
        return;
      }

      try {
        const assets = await service.search(parsed.data.busca);
        const visibility = getAssetSelectionVisibility(request.authUser ?? null);
        response.status(200).json({
          data: visibility === "full" ? assets : assets.map(toMinimalAsset),
        });
      } catch (error) {
        next(error);
      }
    },

    async create(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const parsed = newAssetSchema.safeParse(request.body);
      if (!parsed.success) {
        sendValidationError(response, parsed.error);
        return;
      }

      try {
        const asset = await service.register(parsed.data);
        response.status(201).json({ data: { asset } });
      } catch (error) {
        if (error instanceof DuplicateCodigoPatrimonialError) {
          response.status(409).json({
            error: {
              code: "ASSET_CODE_ALREADY_EXISTS",
              message: error.message,
            },
          });
          return;
        }

        next(error);
      }
    },

    async update(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const id = assetIdSchema.safeParse(request.params);
      if (!id.success) {
        sendValidationError(response, id.error);
        return;
      }

      const changes = assetChangesSchema.safeParse(request.body);
      if (!changes.success) {
        sendValidationError(response, changes.error);
        return;
      }

      try {
        const asset = await service.update(id.data.id, changes.data);
        if (!asset) {
          response.status(404).json({
            error: {
              code: "ASSET_NOT_FOUND",
              message: "Bem patrimonial não encontrado.",
            },
          });
          return;
        }

        response.status(200).json({ data: { asset } });
      } catch (error) {
        next(error);
      }
    },
  };
}
