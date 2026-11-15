import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolicitationForm } from "./SolicitationForm";

let container: HTMLDivElement;
let root: Root;
const created = {
  id: 7, data: "2026-11-14T12:00:00.000Z", local: "Bloco C",
  tipoProblema: "INFORMATICA", descricaoProblema: "Projetor não liga",
  urgencia: "ALTA", status: "EM_ABERTO", setorResponsavel: null,
  observacoes: null, prioridade: null, dataConclusao: null,
  solicitante: { id: "user-1", fullName: "Ana" }, responsavel: null, bem: null,
};
const json = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<SolicitationForm onBack={() => {}} onRequestError={(error) => error instanceof Error ? error.message : "Erro de conexão"} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function change(name: string, value: string) {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)!;
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype :
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function fill() {
  change("local", " Bloco C ");
  change("tipoProblema", "INFORMATICA");
  change("descricaoProblema", " Projetor não liga ");
  change("urgencia", "ALTA");
}
function submit() {
  container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("US007 creation form", () => {
  it("indicates all empty fields and rejects whitespace without sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    change("local", "   ");
    change("descricaoProblema", "   ");
    await act(async () => submit());
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(4);
    expect(document.activeElement).toBe(container.querySelector('[name="local"]'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only the four fields with the session and displays confirmation", async () => {
    const fetchMock = vi.fn(async () => json({ data: { solicitation: created } }));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    await act(async () => submit());
    expect(fetchMock).toHaveBeenCalledWith("/api/solicitations", {
      method: "POST", headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ local: "Bloco C", tipoProblema: "INFORMATICA", descricaoProblema: "Projetor não liga", urgencia: "ALTA" }),
    });
    expect(container.textContent).toContain("registrada com sucesso");
    expect(container.textContent).toContain("Em aberto");
    expect(container.textContent).toContain("Alta");
  });

  it("preserves values and shows API errors by field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: {
      code: "VALIDATION_ERROR", message: "Revise os dados.", fields: { local: "Local inválido." },
    } }, 422)));
    fill();
    await act(async () => submit());
    expect(container.querySelector<HTMLInputElement>('[name="local"]')!.value).toBe(" Bloco C ");
    expect(container.textContent).toContain("Local inválido.");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Revise os dados.");
  });

  it("blocks duplicate submissions while saving", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    act(() => { submit(); submit(); });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect(container.textContent).toContain("Registrando...");
    await act(async () => resolve(json({ data: { solicitation: created } })));
  });
});
