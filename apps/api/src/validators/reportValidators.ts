import { z } from "zod";
import {
  AreaTecnica,
  StatusSolicitacao,
} from "../entities/Solicitation.js";

const INVALID_PERIOD = "A data inicial não pode ser posterior à final.";

export const reportQuerySchema = z
  .object(
    {
      de: z.iso.date({ error: "Data inicial inválida." }).optional(),
      ate: z.iso.date({ error: "Data final inválida." }).optional(),
      setor: z
        .string({ error: "Setor inválido." })
        .trim()
        .min(1, "Setor inválido.")
        .optional(),
      tipo: z
        .enum(AreaTecnica, { error: "Tipo de problema inválido." })
        .optional(),
      status: z
        .enum(StatusSolicitacao, { error: "Status inválido." })
        .optional(),
    },
    { error: "Filtros do relatório inválidos." },
  )
  .refine((query) => !query.de || !query.ate || query.de <= query.ate, {
    error: INVALID_PERIOD,
    path: ["de"],
  });

export type ReportQuery = z.infer<typeof reportQuerySchema>;
