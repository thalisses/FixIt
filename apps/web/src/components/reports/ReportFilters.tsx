import { useEffect, useState, type FormEvent } from "react";
import { tipoProblemaLabels } from "../assets/assetPresentation";
import type {
  AreaTecnica,
  StatusSolicitacao,
} from "../../lib/assetApi";
import type { ReportFilters } from "../../lib/reportApi";

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

export const emptyReportFilters: ReportFilters = {
  de: "",
  ate: "",
  setor: "",
  tipo: "",
  status: "",
};

interface ReportFiltersFormProps {
  applied: ReportFilters;
  onApply(filters: ReportFilters): void;
  onClear(): void;
}

export function ReportFiltersForm({
  applied,
  onApply,
  onClear,
}: ReportFiltersFormProps) {
  const [draft, setDraft] = useState<ReportFilters>(applied);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  function update<K extends keyof ReportFilters>(
    field: K,
    value: ReportFilters[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrorMessage("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (draft.de && draft.ate && draft.de > draft.ate) {
      setErrorMessage("A data inicial não pode ser posterior à final.");
      return;
    }
    onApply(draft);
  }

  function clear() {
    setDraft(emptyReportFilters);
    setErrorMessage("");
    onClear();
  }

  return (
    <form
      aria-label="Filtros do relatório"
      className="report-filters"
      onSubmit={handleSubmit}
    >
      <label className="form-field report-filter-field">
        <span>De</span>
        <input
          name="de"
          onChange={(event) => update("de", event.target.value)}
          type="date"
          value={draft.de}
        />
      </label>

      <label className="form-field report-filter-field">
        <span>Até</span>
        <input
          name="ate"
          onChange={(event) => update("ate", event.target.value)}
          type="date"
          value={draft.ate}
        />
      </label>

      <label className="form-field report-filter-field">
        <span>Setor</span>
        <input
          name="setor"
          onChange={(event) => update("setor", event.target.value)}
          placeholder="Ex.: TI"
          type="search"
          value={draft.setor}
        />
      </label>

      <label className="form-field report-filter-field">
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

      <label className="form-field report-filter-field">
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

      {errorMessage && (
        <p className="form-error report-filter-error" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="report-filter-actions">
        <button className="text-action" onClick={clear} type="button">
          Limpar filtros
        </button>
        <button className="primary-action solicitation-filter-submit" type="submit">
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
