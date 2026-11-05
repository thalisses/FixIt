import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { DuplicateCodigoPatrimonialError } from "../repositories/assetRepository.js";
import type { AssetService } from "../services/assetService.js";
import { newAssetSchema } from "../validators/assetValidators.js";

export function createAssetController(service: AssetService) {
  return {
    async create(
      request: Request,
      response: Response,
      next: NextFunction,
    ): Promise<void> {
      const parsed = newAssetSchema.safeParse(request.body);
      if (!parsed.success) {
        const { fieldErrors } = z.flattenError(parsed.error);
        const fields = Object.fromEntries(
          Object.entries(fieldErrors).map(([field, messages]) => [
            field,
            messages?.at(0),
          ]),
        );
        response.status(400).json({ error: "Dados inválidos.", fields });
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
  };
}
