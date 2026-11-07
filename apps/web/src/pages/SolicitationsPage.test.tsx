import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import type { SolicitationListItem } from "../lib/solicitationApi";
import { SolicitationsPage } from "./SolicitationsPage";

let container: HTMLDivElement;
let root: Root;

const item: SolicitationListItem = {
  id: 1,
  data: "2026-11-07T12:00:00.000Z",
  local: "Bloco C, sala 12",
  tipoProblema: "INFORMATICA",
  setorResponsavel: "TI",
  urgencia: "ALTA",
  prioridade: "MEDIA",
  status: "EM_ABERTO",
  dataConclusao: null,
  solicitante: { id: "user-2", fullName: "Bruno Souza" },
  responsavel: null,
  bem: {
    id: 7,
    codigoPatrimonial: "PAT-7",
    descricao: "Projetor Epson",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Backend {
  role?: string;
  list?(url: string): Response;
}

function stubBackend({ role = "GESTOR", list }: Backend) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/sessions/current") {
      return jsonResponse({
        data: {
          user: {
            id: "user-1",
            fullName: "Ana Silva",
            email: "ana@example.edu",
            role,
          },
        },
      });
    }
    if (list) {
      return list(url);
    }
    return jsonResponse({
      data: [item],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountPage() {
  act(() => {
    root.render(
      <AuthProvider>
        <SolicitationsPage onLoggedOut={() => {}} onNavigate={() => {}} />
      </AuthProvider>,
    );
  });
  await settle();
}

async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) =>
      candidate.textContent === label ||
      candidate.getAttribute("aria-label") === label,
  );
  expect(button, `botão ${label}`).toBeDefined();
  await act(async () => button?.click());
  await settle();
}

function setValue(selector: string, value: string) {
  const element = container.querySelector<
    HTMLInputElement | HTMLSelectElement
  >(selector);
  expect(element, selector).not.toBeNull();
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element?.dispatchEvent(new Event("input", { bubbles: true }));
    element?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitFilters() {
  const form = container.querySelector<HTMLFormElement>(
    'form[aria-label="Filtros de solicitações"]',
  );
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await settle();
}

function lastListUrl(fetchMock: ReturnType<typeof stubBackend>): string {
  const urls = fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith("/api/solicitations"));
  return urls.at(-1) ?? "";
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SolicitationsPage", () => {
  it("lists the requests with the fields of US013 CA1", async () => {
    stubBackend({});
    await mountPage();

    expect(container.querySelector("#solicitations-title")?.textContent).toBe(
      "Solicitações",
    );
    expect(container.textContent).toContain("#CH-2026-0001");
    expect(container.textContent).toContain("Bruno Souza");
    expect(container.textContent).toContain("PAT-7");
    expect(container.textContent).toContain("Projetor Epson");
    expect(container.textContent).toContain("Em aberto");
    expect(container.textContent).toContain("Não atribuído");
  });

  it("applies combined filters and resets the page (CA2)", async () => {
    const fetchMock = stubBackend({});
    await mountPage();

    setValue('select[name="status"]', "EM_ABERTO");
    setValue('input[type="search"]', "TI");
    await submitFilters();

    const url = lastListUrl(fetchMock);
    expect(url).toContain("status=EM_ABERTO");
    expect(url).toContain("setor=TI");
    expect(url).toContain("page=1");
  });

  it("shows an informative empty state and clears the filters (CA3)", async () => {
    const fetchMock = stubBackend({
      list: () =>
        jsonResponse({
          data: [],
          pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
        }),
    });
    await mountPage();

    setValue('select[name="status"]', "CONCLUIDO");
    await submitFilters();

    expect(container.textContent).toContain(
      "Nenhuma solicitação encontrada para os filtros selecionados.",
    );

    await clickButton("Limpar filtros e ver todas");
    expect(lastListUrl(fetchMock)).toBe("/api/solicitations?page=1&pageSize=20");
  });

  it("shows the triage filter only for Gestor", async () => {
    stubBackend({ role: "CLIENTE" });
    await mountPage();

    expect(container.textContent).not.toContain("Somente sem responsável");
  });

  it("navigates to the next page", async () => {
    const fetchMock = stubBackend({
      list: () =>
        jsonResponse({
          data: [item],
          pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2 },
        }),
    });
    await mountPage();

    await clickButton("Próxima página");

    expect(lastListUrl(fetchMock)).toContain("page=2");
  });

  it("shows an error with a retry action", async () => {
    stubBackend({
      list: () =>
        jsonResponse(
          { error: { code: "INTERNAL_SERVER_ERROR", message: "Falhou." } },
          500,
        ),
    });
    await mountPage();

    expect(container.textContent).toContain("Falhou.");
    expect(container.textContent).toContain("Tentar novamente");
  });
});
