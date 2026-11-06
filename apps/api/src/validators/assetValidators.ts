import { z } from "zod";
import { EstadoConservacao } from "../entities/Asset.js";
import { idParamSchema } from "./idParamSchema.js";

function requiredText(message: string) {
  return z.string({ error: message }).trim().min(1, message);
}

function nullableDate(label: string) {
  return z.iso
    .date({ error: `${label} deve ser uma data válida.` })
    .nullable()
    .optional();
}

function optionalDate(label: string) {
  return nullableDate(label).transform((value) => value ?? null);
}

export const assetSearchSchema = z.object({
  busca: z
    .string({ error: "Busca inválida." })
    .trim()
    .optional(),
});

const codigoPatrimonial = requiredText("Código patrimonial é obrigatório.");
const descricao = requiredText("Descrição é obrigatória.");
const localizacao = requiredText("Localização é obrigatória.");
const estadoConservacao = z.enum(EstadoConservacao, {
  error: "Estado de conservação inválido.",
});

export const newAssetSchema = z.object(
  {
    codigoPatrimonial,
    descricao,
    localizacao,
    estadoConservacao,
    dataAquisicao: optionalDate("Data de aquisição"),
    garantia: optionalDate("Garantia"),
  },
  { error: "Dados do bem patrimonial inválidos." },
);

export const assetIdSchema = idParamSchema;

export const assetChangesSchema = z
  .object(
    {
      codigoPatrimonial: codigoPatrimonial.optional(),
      descricao: descricao.optional(),
      localizacao: localizacao.optional(),
      estadoConservacao: estadoConservacao.optional(),
      dataAquisicao: nullableDate("Data de aquisição"),
      garantia: nullableDate("Garantia"),
    },
    { error: "Dados do bem patrimonial inválidos." },
  )
  .refine((changes) => Object.keys(changes).length > 0, {
    error: "Informe ao menos um campo para alterar.",
  });
