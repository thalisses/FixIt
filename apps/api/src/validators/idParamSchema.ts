import { z } from "zod";

const INVALID_ID = "Identificador inválido.";
const MAX_POSTGRES_INTEGER = 2147483647;

/** Valida o `:id` numérico de uma rota, como `/api/assets/:id`. */
export const idParamSchema = z.object({
  id: z.coerce
    .number({ error: INVALID_ID })
    .int(INVALID_ID)
    .positive(INVALID_ID)
    .max(MAX_POSTGRES_INTEGER, INVALID_ID),
});
