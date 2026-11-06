import { z } from "zod";

export const MAX_OBSERVATION_LENGTH = 2000;

const EMPTY_OBSERVATION = "Escreva a observação.";

export const observationSchema = z.object(
  {
    descricao: z
      .string({ error: EMPTY_OBSERVATION })
      .trim()
      .min(1, EMPTY_OBSERVATION)
      .max(
        MAX_OBSERVATION_LENGTH,
        "A observação pode ter até 2.000 caracteres.",
      ),
  },
  { error: "Dados da observação inválidos." },
);
