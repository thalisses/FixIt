import { useEffect, useState, type FormEvent } from "react";
import { tipoProblemaLabels } from "../assets/assetPresentation";
import type {
  AreaTecnica,
  StatusSolicitacao,
} from "../../lib/assetApi";
import type {
  NivelPrioridade,
  SolicitationFilters,
} from "../../lib/solicitationApi";
import { priorityLabels } from "./solicitationPresentation";

const statusOptions: Array<{
  value: StatusSolicitacao;
  label: string;
}> = [
  { value: "EM_ABERTO", label: "Em aberto" },
  { value: "EM_ATENDIMENTO", label: "Em atendimento" },
  { value: "CONCLUIDO", label: "Concluído" },
  { value: "CANCELADA", label: "Cancelada" },
];

const tipoOptions = Object.entries(tipoProblemaLabels) as Array<
  [AreaTecnica, string]
>;

const prioridadeOptions = Object.entries(priorityLabels) as Array<
  [NivelPrioridade, string]
>;

export const emptySolicitationFilters: SolicitationFilters = {
  status: "",
  setor: "",
  tipo: "",
  prioridade: "",
  de: "",
  ate: "",
  semResponsavel: false,
};

interface SolicitationFiltersProps {
  applied: SolicitationFilters;
  showUnassigned: boolean;
  onApply(filters: SolicitationFilters): void;
  onClear(): void;
}

export function SolicitationFiltersForm({
  applied,
  showUnassigned,
  onApply,
  onClear,
}: SolicitationFiltersProps) {
  const [draft, setDraft] = useState<SolicitationFilters>(applied);

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  function update<K extends keyof SolicitationFilters>(
    field: K,
    value: SolicitationFilters[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onApply(draft);
  }

  return (
    <form
      aria-label="Filtros de solicitações"
      className="solicitation-filters"
      onSubmit={handleSubmit}
    >
      <label className="form-field solicitation-filter-field">
        <span>Status</span>
        <select
          name="status"
          onChange={(event) =>
            update("status", event.target.value as StatusSolicitacao | "")
          }
          value={draft.status}
        >
          <option value="">Todos</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="form-field solicitation-filter-field">
        <span>Setor</span>
        <input
          name="setor"
          onChange={(event) => update("setor", event.target.value)}
          placeholder="Ex.: TI"
          type="search"
          value={draft.setor}
        />
      </label>

      <label className="form-field solicitation-filter-field">
        <span>Tipo de problema</span>
        <select
          name="tipo"
          onChange={(event) =>
            update("tipo", event.target.value as AreaTecnica | "")
          }
          value={draft.tipo}
        >
          <option value="">Todos</option>
          {tipoOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="form-field solicitation-filter-field">
        <span>Prioridade</span>
        <select
          name="prioridade"
          onChange={(event) =>
            update("prioridade", event.target.value as NivelPrioridade | "")
          }
          value={draft.prioridade}
        >
          <option value="">Todas</option>
          {prioridadeOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="form-field solicitation-filter-field">
        <span>De</span>
        <input
          name="de"
          onChange={(event) => update("de", event.target.value)}
          type="date"
          value={draft.de}
        />
      </label>

      <label className="form-field solicitation-filter-field">
        <span>Até</span>
        <input
          name="ate"
          onChange={(event) => update("ate", event.target.value)}
          type="date"
          value={draft.ate}
        />
      </label>

      {showUnassigned && (
        <label className="solicitation-checkbox">
          <input
            checked={Boolean(draft.semResponsavel)}
            onChange={(event) =>
              update("semResponsavel", event.target.checked)
            }
            type="checkbox"
          />
          <span>Somente sem responsável</span>
        </label>
      )}

      <div className="solicitation-filter-actions">
        <button className="text-action" onClick={onClear} type="button">
          Limpar filtros
        </button>
        <button className="primary-action solicitation-filter-submit" type="submit">
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
