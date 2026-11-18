import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AssetApiError, searchAssetOptions, type AssetOption } from "../../lib/assetApi";

/** Quantos resultados mostrar; acima disso, a pessoa refina a busca. */
export const MAX_ASSET_RESULTS = 10;

interface Props {
  value: AssetOption | null;
  onChange(asset: AssetOption | null): void;
  disabled: boolean;
  /** Erro do campo `bemId` devolvido pela API. */
  error?: string;
}

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; term: string; results: AssetOption[] }
  | { kind: "failed"; message: string };

/** Busca e seleção opcional do bem ao abrir uma solicitação (US008, CA1 e CA2). */
export function SolicitationAssetPicker({ value, onChange, disabled, error }: Props) {
  const id = useId();
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const requestRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<"search" | "remove" | null>(null);

  // Depois de escolher ou remover, o botão clicado some; o foco vai para o próximo controle útil.
  useEffect(() => {
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (target === "remove") removeButtonRef.current?.focus();
    if (target === "search") searchInputRef.current?.focus();
  }, [value]);

  async function runSearch() {
    const trimmed = term.trim();
    if (!trimmed || disabled) return;
    // Só a resposta da última busca vale, mesmo que uma anterior chegue depois.
    const requestId = ++requestRef.current;
    setSearch({ kind: "loading" });
    try {
      const results = await searchAssetOptions(trimmed);
      if (requestId === requestRef.current) setSearch({ kind: "done", term: trimmed, results });
    } catch (caught) {
      if (requestId !== requestRef.current) return;
      setSearch({
        kind: "failed",
        message: caught instanceof AssetApiError ? caught.message : "Não foi possível buscar os bens.",
      });
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter busca o bem, sem enviar o formulário da solicitação.
    if (event.key === "Enter") {
      event.preventDefault();
      void runSearch();
    }
  }

  function choose(asset: AssetOption) {
    pendingFocusRef.current = "remove";
    requestRef.current += 1;
    setSearch({ kind: "idle" });
    setTerm("");
    onChange(asset);
  }

  function remove() {
    pendingFocusRef.current = "search";
    onChange(null);
  }

  const errorId = `${id}-error`;
  const shown = search.kind === "done" ? search.results.slice(0, MAX_ASSET_RESULTS) : [];

  return (
    <section className="solicitation-asset-picker" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Bem patrimonial <span className="field-help">(opcional)</span></h2>
      <p className="field-help" id={`${id}-hint`}>
        Informe o equipamento com problema para o chamado entrar no histórico dele. Se o problema não for de um equipamento, como uma infiltração, deixe em branco.
      </p>

      {value ? (
        <div className="solicitation-asset-selected">
          <p>
            <span className="field-help">Bem selecionado</span>
            <strong>{value.codigoPatrimonial}</strong> {value.descricao}
          </p>
          <button
            ref={removeButtonRef}
            className="text-action"
            type="button"
            disabled={disabled}
            aria-label={`Remover o bem ${value.codigoPatrimonial}, ${value.descricao}`}
            aria-describedby={error ? errorId : undefined}
            onClick={remove}
          >
            Remover
          </button>
        </div>
      ) : (
        <>
          <div className="asset-search">
            <label className="form-field" htmlFor={`${id}-search`}>
              <span>Buscar por código ou descrição</span>
              <input
                ref={searchInputRef}
                id={`${id}-search`}
                type="search"
                placeholder="Ex.: PAT-1024 ou projetor"
                value={term}
                disabled={disabled}
                aria-invalid={Boolean(error)}
                aria-describedby={`${id}-hint${error ? ` ${errorId}` : ""}`}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={handleKeyDown}
              />
            </label>
            <button
              className="text-action"
              type="button"
              disabled={disabled || !term.trim()}
              onClick={() => void runSearch()}
            >
              Buscar
            </button>
          </div>

          <p className="field-help" role="status">{statusText(search)}</p>
          {search.kind === "failed" && <p className="form-error" role="alert">{search.message}</p>}
          {shown.length > 0 && (
            <ul className="solicitation-asset-results" aria-label="Bens encontrados">
              {shown.map((asset) => (
                <li key={asset.id}>
                  <button type="button" disabled={disabled} onClick={() => choose(asset)}>
                    <strong>{asset.codigoPatrimonial}</strong>
                    <span>{asset.descricao}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && <span className="asset-field-error" id={errorId}>{error}</span>}
    </section>
  );
}

function statusText(search: SearchState): string {
  if (search.kind === "loading") return "Buscando bens...";
  if (search.kind !== "done") return "";
  const total = search.results.length;
  if (total === 0) return `Nenhum bem encontrado para "${search.term}".`;
  if (total > MAX_ASSET_RESULTS) {
    return `Mostrando ${MAX_ASSET_RESULTS} de ${total} bens. Refine a busca para encontrar outro.`;
  }
  return total === 1 ? "1 bem encontrado. Escolha o bem abaixo." : `${total} bens encontrados. Escolha o bem abaixo.`;
}
