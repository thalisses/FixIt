import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetOption } from "../../lib/assetApi";
import { SolicitationAssetPicker } from "./SolicitationAssetPicker";

let container: HTMLDivElement;
let root: Root;
let onChange: ReturnType<typeof vi.fn<(asset: AssetOption | null) => void>>;

const projector: AssetOption = { id: 7, codigoPatrimonial: "PAT-7", descricao: "Projetor Epson" };
const notebook: AssetOption = { id: 8, codigoPatrimonial: "PAT-8", descricao: "Projetor BenQ" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState<AssetOption | null>(null);
  return (
    <SolicitationAssetPicker value={value} disabled={false} error={error} onChange={(asset) => {
      onChange(asset);
      setValue(asset);
    }} />
  );
}

function render(error?: string) {
  act(() => root.render(<Harness error={error} />));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onChange = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const searchInput = () => container.querySelector<HTMLInputElement>('input[type="search"]')!;
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === text);
const status = () => container.querySelector('[role="status"]')?.textContent;
const resultButtons = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".solicitation-asset-results button"));

function type(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(searchInput(), value);
    searchInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function search(value: string) {
  type(value);
  await act(async () => button("Buscar")!.click());
}

describe("US008 asset picker", () => {
  it("searches by code or description and lists the assets found (CA1)", async () => {
    const fetchMock = vi.fn(async () => json({ data: [projector, notebook] }));
    vi.stubGlobal("fetch", fetchMock);
    render();
    await search(" projetor ");
    expect(fetchMock).toHaveBeenCalledWith("/api/assets?busca=projetor", { credentials: "same-origin" });
    expect(status()).toBe("2 bens encontrados. Escolha o bem abaixo.");
    expect(resultButtons().map((entry) => entry.textContent)).toEqual(["PAT-7Projetor Epson", "PAT-8Projetor BenQ"]);
  });

  it("searches on Enter without submitting the solicitation form", async () => {
    const fetchMock = vi.fn(async () => json({ data: [projector] }));
    vi.stubGlobal("fetch", fetchMock);
    render();
    type("PAT-7");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { searchInput().dispatchEvent(enter); });
    expect(enter.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(status()).toBe("1 bem encontrado. Escolha o bem abaixo.");
  });

  it("does not search with an empty term, so it never lists every asset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render();
    expect(button("Buscar")!.disabled).toBe(true);
    type("   ");
    expect(button("Buscar")!.disabled).toBe(true);
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { searchInput().dispatchEvent(enter); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects an asset, hides the search and moves focus to Remover", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [projector, notebook] })));
    render();
    await search("projetor");
    act(() => resultButtons()[0].click());
    expect(onChange).toHaveBeenLastCalledWith(projector);
    expect(container.textContent).toContain("Bem selecionado");
    expect(container.textContent).toContain("PAT-7 Projetor Epson");
    expect(searchInput()).toBeNull();
    expect(resultButtons()).toHaveLength(0);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Remover o bem PAT-7, Projetor Epson");
  });

  it("removes the selected asset and returns focus to the search (CA2)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [projector] })));
    render();
    await search("PAT-7");
    act(() => resultButtons()[0].click());
    act(() => button("Remover")!.click());
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(container.textContent).not.toContain("Bem selecionado");
    expect(document.activeElement).toBe(searchInput());
  });

  it("tells when no asset matches the search", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [] })));
    render();
    await search("infiltração");
    expect(status()).toBe('Nenhum bem encontrado para "infiltração".');
    expect(resultButtons()).toHaveLength(0);
  });

  it("shows at most 10 results and asks to refine the search", async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1, codigoPatrimonial: `PAT-${index + 1}`, descricao: "Cadeira",
    }));
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: many })));
    render();
    await search("cadeira");
    expect(resultButtons()).toHaveLength(10);
    expect(status()).toBe("Mostrando 10 de 12 bens. Refine a busca para encontrar outro.");
  });

  it("shows the API message when the search fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      error: { code: "UNAUTHENTICATED", message: "Autenticação necessária." },
    }, 401)));
    render();
    await search("projetor");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Autenticação necessária.");
    expect(resultButtons()).toHaveLength(0);
  });

  it("keeps only the answer of the latest search", async () => {
    let answerFirst!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((done) => { answerFirst = done; }))
      .mockImplementationOnce(async () => json({ data: [notebook] }));
    vi.stubGlobal("fetch", fetchMock);
    render();
    type("projetor");
    act(() => button("Buscar")!.click());
    // A segunda busca começa enquanto a primeira ainda carrega, e a primeira responde por último.
    await search("benq");
    await act(async () => answerFirst(json({ data: [projector] })));
    expect(resultButtons().map((entry) => entry.textContent)).toEqual(["PAT-8Projetor BenQ"]);
  });

  it("shows the bemId error returned by the API on the search field", () => {
    render("Bem patrimonial não encontrado.");
    expect(container.textContent).toContain("Bem patrimonial não encontrado.");
    expect(searchInput().getAttribute("aria-invalid")).toBe("true");
    expect(searchInput().getAttribute("aria-describedby")).toContain(
      container.querySelector(".asset-field-error")!.id,
    );
  });
});
