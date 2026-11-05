import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { DuplicateCodigoPatrimonialError } from "../repositories/assetRepository.js";
import type { AssetService } from "../services/assetService.js";
import { newAssetSchema } from "../validators/assetValidators.js";

function sendValidationError(response: Response, error: z.ZodError): void {
  const { fieldErrors } = z.flattenError(error);
  const fields = Object.fromEntries(
    Object.entries(fieldErrors).map(([field, messages]) => [
      field,
      (messages as string[] | undefined)?.at(0),
    ]),
  );
  response.status(422).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Dados do bem patrimonial inválidos.",
      fields,
    },
  });
}

export function createAssetController(service: AssetService) {
  return {
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
  };
}
