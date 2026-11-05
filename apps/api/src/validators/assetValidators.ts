import { z } from "zod";
import { EstadoConservacao } from "../entities/Asset.js";

function requiredText(message: string) {
  return z.string({ error: message }).trim().min(1, message);
}

function optionalDate(label: string) {
  return z.iso
    .date({ error: `${label} deve ser uma data válida.` })
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}

export const assetSearchSchema = z.object({
  busca: z
    .string({ error: "Busca inválida." })
    .trim()
    .optional(),
});

const localizacao = requiredText("Localização é obrigatória.");
const estadoConservacao = z.enum(EstadoConservacao, {
  error: "Estado de conservação inválido.",
});

export const newAssetSchema = z.object(
  {
    codigoPatrimonial: requiredText("Código patrimonial é obrigatório."),
    descricao: requiredText("Descrição é obrigatória."),
    localizacao,
    estadoConservacao,
    dataAquisicao: optionalDate("Data de aquisição"),
    garantia: optionalDate("Garantia"),
  },
  { error: "Dados inválidos." },
);

const INVALID_ID = "Identificador inválido.";
const MAX_POSTGRES_INTEGER = 2147483647;

export const assetIdSchema = z.object({
  id: z.coerce
    .number({ error: INVALID_ID })
    .int(INVALID_ID)
    .positive(INVALID_ID)
    .max(MAX_POSTGRES_INTEGER, INVALID_ID),
});

export const assetChangesSchema = z
  .object(
    {
      localizacao: localizacao.optional(),
      estadoConservacao: estadoConservacao.optional(),
    },
    { error: "Dados inválidos." },
  )
  .refine((changes) => Object.keys(changes).length > 0, {
    error: "Informe a localização ou o estado de conservação.",
  });
