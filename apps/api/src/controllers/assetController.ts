import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
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
  response
    .status(400)
    .json({ error: formErrors.at(0) ?? "Dados inválidos.", fields });
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
        response.status(200).json(await service.search(parsed.data.busca));
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
        response.status(201).json(asset);
      } catch (error) {
        if (error instanceof DuplicateCodigoPatrimonialError) {
          response.status(409).json({ error: error.message });
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
          response.status(404).json({ error: "Bem patrimonial não encontrado." });
          return;
        }

        response.status(200).json(asset);
      } catch (error) {
        next(error);
      }
    },
  };
}
