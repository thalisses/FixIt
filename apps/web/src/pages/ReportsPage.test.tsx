import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import type { MaintenanceReport } from "../lib/reportApi";
import { ReportsPage } from "./ReportsPage";

let container: HTMLDivElement;
let root: Root;

const report: MaintenanceReport = {
  total: 5,
  byStatus: {
    EM_ABERTO: 2,
    EM_ATENDIMENTO: 1,
    CONCLUIDO: 1,
    CANCELADA: 1,
  },
  averageResolutionHours: 36,
  topAssets: [
    {
      asset: { id: 1, codigoPatrimonial: "PAT-1", descricao: "Projetor" },
      count: 4,
    },
  ],
  hasData: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubReport(
  reply: Response = jsonResponse({ data: report }),
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/sessions/current") {
      return jsonResponse({
        data: {
          user: {
            id: "user-1",
            fullName: "Ana Silva",
            email: "ana@example.edu",
            role: "GESTOR",
          },
        },
      });
    }
    return reply.clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

function lastReportUrl(fetchMock: ReturnType<typeof stubReport>): string {
  const urls = fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith("/api/reports/maintenance"));
  return urls.at(-1) ?? "";
}

async function mountPage() {
  act(() => {
    root.render(
      <AuthProvider>
        <ReportsPage onLoggedOut={() => {}} onNavigate={() => {}} />
      </AuthProvider>,
    );
  });
  await settle();
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

describe("ReportsPage", () => {
  it("shows the indicators of US020 CA1", async () => {
    stubReport();
    await mountPage();

    expect(container.querySelector("#reports-title")?.textContent).toBe(
      "Relatórios",
    );
    expect(container.textContent).toContain("Total de solicitações");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("1.5 dias");
    expect(container.textContent).toContain("Em aberto");
    expect(container.textContent).toContain("Projetor");
    expect(container.textContent).toContain("PAT-1");
  });

  it("applies the period, sector, type and status filters (CA1)", async () => {
    const fetchMock = stubReport();
    await mountPage();

    setValue('input[name="de"]', "2026-11-01");
    setValue('input[name="ate"]', "2026-11-30");
    setValue('input[name="setor"]', "TI");
    setValue('select[name="tipo"]', "INFORMATICA");
    setValue('select[name="status"]', "CONCLUIDO");
    await clickButton("Aplicar filtros");

    const url = lastReportUrl(fetchMock);
    expect(url).toContain("de=2026-11-01");
    expect(url).toContain("ate=2026-11-30");
    expect(url).toContain("setor=TI");
    expect(url).toContain("tipo=INFORMATICA");
    expect(url).toContain("status=CONCLUIDO");
  });

  it("rejects a period with the end before the start (CA2)", async () => {
    const fetchMock = stubReport();
    await mountPage();
    const callsBefore = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/reports/maintenance"),
    ).length;

    setValue('input[name="de"]', "2026-11-30");
    setValue('input[name="ate"]', "2026-11-01");
    await clickButton("Aplicar filtros");

    expect(container.textContent).toContain(
      "A data inicial não pode ser posterior à final.",
    );
    const callsAfter = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/reports/maintenance"),
    ).length;
    expect(callsAfter).toBe(callsBefore);
  });

  it("shows an informative empty state when filters return nothing (CA3)", async () => {
    stubReport(
      jsonResponse({
        data: {
          total: 0,
          byStatus: {
            EM_ABERTO: 0,
            EM_ATENDIMENTO: 0,
            CONCLUIDO: 0,
            CANCELADA: 0,
          },
          averageResolutionHours: null,
          topAssets: [],
          hasData: false,
        },
      }),
    );
    await mountPage();

    setValue('select[name="status"]', "CONCLUIDO");
    await clickButton("Aplicar filtros");

    expect(container.textContent).toContain(
      "Nenhum dado encontrado para os filtros selecionados.",
    );
    expect(container.textContent).toContain("Limpar filtros");
  });

  it("shows an informative empty state when there is no data (CA3)", async () => {
    stubReport(
      jsonResponse({
        data: {
          total: 0,
          byStatus: {
            EM_ABERTO: 0,
            EM_ATENDIMENTO: 0,
            CONCLUIDO: 0,
            CANCELADA: 0,
          },
          averageResolutionHours: null,
          topAssets: [],
          hasData: false,
        },
      }),
    );
    await mountPage();

    expect(container.textContent).toContain(
      "Ainda não há solicitações registradas.",
    );
    expect(container.textContent).not.toContain("Total de solicitações");
  });

  it("shows an error with retry", async () => {
    stubReport(
      jsonResponse(
        { error: { code: "INTERNAL_SERVER_ERROR", message: "Falhou." } },
        500,
      ),
    );
    await mountPage();

    expect(container.textContent).toContain("Falhou.");
    expect(container.textContent).toContain("Tentar novamente");
  });
});
