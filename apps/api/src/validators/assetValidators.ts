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

export const newAssetSchema = z.object({
  codigoPatrimonial: requiredText("Código patrimonial é obrigatório."),
  descricao: requiredText("Descrição é obrigatória."),
  localizacao: requiredText("Localização é obrigatória."),
  estadoConservacao: z.enum(EstadoConservacao, {
    error: "Estado de conservação inválido.",
  }),
  dataAquisicao: optionalDate("Data de aquisição"),
  garantia: optionalDate("Garantia"),
});
