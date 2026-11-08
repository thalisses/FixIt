import { z } from "zod";
import {
  AreaTecnica,
  NivelPrioridade,
  StatusSolicitacao,
} from "../entities/Solicitation.js";

const INVALID_PAGE = "Paginação inválida.";
const INVALID_PAGE_SIZE = "O tamanho da página deve estar entre 1 e 100.";
const INVALID_DATE_RANGE = "A data inicial não pode ser posterior à final.";
const MAX_POSTGRES_INTEGER = 2147483647;
const MAX_PAGE_SIZE = 100;

const optionalPage = z.coerce
  .number({ error: INVALID_PAGE })
  .int(INVALID_PAGE)
  .positive(INVALID_PAGE)
  .max(MAX_POSTGRES_INTEGER, INVALID_PAGE)
  .optional();

const optionalPageSize = z.coerce
  .number({ error: INVALID_PAGE_SIZE })
  .int(INVALID_PAGE_SIZE)
  .positive(INVALID_PAGE_SIZE)
  .max(MAX_PAGE_SIZE, INVALID_PAGE_SIZE)
  .optional();

export const solicitationListQuerySchema = z
  .object(
    {
      status: z
        .enum(StatusSolicitacao, { error: "Status inválido." })
        .optional(),
      setor: z
        .string({ error: "Setor inválido." })
        .trim()
        .min(1, "Setor inválido.")
        .optional(),
      tipo: z
        .enum(AreaTecnica, { error: "Tipo de problema inválido." })
        .optional(),
      prioridade: z
        .enum(NivelPrioridade, { error: "Prioridade inválida." })
        .optional(),
      responsavelId: z
        .uuid({ error: "Responsável inválido." })
        .optional(),
      de: z.iso.date({ error: "Data inicial inválida." }).optional(),
      ate: z.iso.date({ error: "Data final inválida." }).optional(),
      semResponsavel: z
        .enum(["true", "false"], { error: "Filtro de responsável inválido." })
        .transform((value) => value === "true")
        .optional(),
      page: optionalPage,
      pageSize: optionalPageSize,
    },
    { error: "Filtros da solicitação inválidos." },
  )
  .refine(
    (query) => !query.de || !query.ate || query.de <= query.ate,
    { error: INVALID_DATE_RANGE, path: ["de"] },
  )
  .refine((query) => !(query.semResponsavel && query.responsavelId), {
    error: "Não combine 'sem responsável' com um responsável específico.",
    path: ["semResponsavel"],
  });

export type SolicitationListQuery = z.infer<typeof solicitationListQuerySchema>;

export const changeSolicitationStatusSchema = z.object(
  {
    status: z.enum(StatusSolicitacao, { error: "Status inválido." }),
  },
  { error: "Dados da mudança de status inválidos." },
);

export const changeSolicitationPrioritySchema = z.object(
  {
    prioridade: z.enum(NivelPrioridade, { error: "Prioridade inválida." }),
  },
  { error: "Dados da prioridade inválidos." },
);
