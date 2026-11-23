import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import type { MaintenanceReport } from "../lib/reportApi";
import { generateReportCsv } from "../lib/reportCsv";
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

function exportButton() {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === "Exportar CSV",
  );
  if (!button) {
    throw new Error("Botão Exportar CSV não encontrado.");
  }
  return button;
}

function printButton() {
  const button = container.querySelector<HTMLButtonElement>(
    '.report-page-actions button:last-child',
  );
  expect(button?.textContent).toBe("Imprimir");
  return button!;
}

function stubDownload() {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:report");
  const revokeObjectURL = vi.fn();
  class DownloadURL extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal("URL", DownloadURL);
  const clickedLinks: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.isConnected).toBe(true);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    clickedLinks.push(this);
  });
  return { createObjectURL, revokeObjectURL, clickedLinks };
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
  vi.restoreAllMocks();
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

  it("prints the displayed report and summarizes only the applied filters", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const fetchMock = stubReport();
    await mountPage();

    const summary = () => container.querySelector(".report-print-filters");
    expect(printButton().disabled).toBe(false);
    expect(summary()?.textContent).toContain("Nenhum filtro aplicado");

    setValue('input[name="de"]', "2026-11-01");
    setValue('input[name="ate"]', "2026-11-30");
    setValue('input[name="setor"]', " TI ");
    setValue('select[name="tipo"]', "INFORMATICA");
    setValue('select[name="status"]', "CONCLUIDO");
    await clickButton("Aplicar filtros");
    setValue('input[name="setor"]', "Compras");
    setValue('select[name="status"]', "CANCELADA");

    expect(Array.from(summary()!.querySelectorAll("span"), (item) => item.textContent))
      .toEqual([
        "De: 01/11/2026",
        "Até: 30/11/2026",
        "Setor: TI",
        "Tipo de problema: Informática",
        "Status: Concluído",
      ]);
    const reportContent = () => Array.from(
      container.querySelectorAll(".report-summary-grid strong, .report-status-grid strong, .report-table td"),
      (item) => item.textContent,
    );
    const calls = fetchMock.mock.calls.length;
    await clickButton("Imprimir");

    expect(print).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(reportContent()).toEqual(["5", "1.5 dias", "2", "1", "1", "1", "1", "Projetor", "PAT-1", "4"]);
  });

  it("downloads the displayed filtered report without applying a draft or fetching again", async () => {
    const filteredReport: MaintenanceReport = {
      ...report,
      total: 1,
      byStatus: { EM_ABERTO: 0, EM_ATENDIMENTO: 0, CONCLUIDO: 1, CANCELADA: 0 },
      topAssets: [
        {
          asset: { id: 2, codigoPatrimonial: "PAT-2", descricao: "Balança" },
          count: 1,
        },
      ],
    };
    const fetchMock = stubReport();
    const initialFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input) =>
      String(input) === "/api/reports/maintenance?setor=TI"
        ? Promise.resolve(jsonResponse({ data: filteredReport }))
        : initialFetch(input),
    );
    const download = stubDownload();
    await mountPage();
    expect(exportButton().disabled).toBe(false);
    expect(container.textContent).toContain("Projetor");

    setValue('input[name="setor"]', "TI");
    await clickButton("Aplicar filtros");
    expect(lastReportUrl(fetchMock)).toBe("/api/reports/maintenance?setor=TI");
    expect(container.querySelector(".report-total strong")?.textContent).toBe("1");
    expect(container.querySelector(".report-table")?.textContent).toContain("Balança");

    setValue('input[name="setor"]', "Compras");
    const callCount = fetchMock.mock.calls.length;
    await clickButton("Exportar CSV");

    expect(fetchMock).toHaveBeenCalledTimes(callCount);
    expect(download.createObjectURL).toHaveBeenCalledTimes(1);
    const [[blob]] = download.createObjectURL.mock.calls;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    expect(Array.from(new Uint8Array(bytes).slice(0, 3))).toEqual([239, 187, 191]);
    expect(new TextDecoder().decode(bytes)).toBe(generateReportCsv(filteredReport));
    expect(download.clickedLinks).toHaveLength(1);
    expect(download.clickedLinks[0].download).toBe("relatorio-manutencao.csv");
    expect(download.clickedLinks[0].href).toBe("blob:report");
    expect(download.clickedLinks[0].isConnected).toBe(false);
    expect(download.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:report");
  });

  it("blocks exporting and printing the previous report while applied filters load and after they fail", async () => {
    const fetchMock = stubReport();
    const initialFetch = fetchMock.getMockImplementation()!;
    let finishRequest!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    fetchMock.mockImplementation((input) =>
      String(input) === "/api/reports/maintenance?status=CONCLUIDO"
        ? pending
        : initialFetch(input),
    );
    const download = stubDownload();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await mountPage();
    expect(exportButton().disabled).toBe(false);

    setValue('select[name="status"]', "CONCLUIDO");
    await clickButton("Aplicar filtros");
    expect(container.textContent).toContain("Carregando indicadores...");
    expect(exportButton().disabled).toBe(true);
    expect(printButton().disabled).toBe(true);
    expect(container.querySelector(".report-print-filters")).toBeNull();
    await clickButton("Exportar CSV");
    await clickButton("Imprimir");

    await act(async () => {
      finishRequest(jsonResponse({ error: { message: "Falhou." } }, 500));
    });
    expect(container.textContent).toContain("Falhou.");
    expect(exportButton().disabled).toBe(true);
    expect(printButton().disabled).toBe(true);
    expect(container.querySelector(".report-print-filters")).toBeNull();
    await clickButton("Exportar CSV");
    await clickButton("Imprimir");
    expect(download.createObjectURL).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();

    await clickButton("Limpar filtros");
    expect(lastReportUrl(fetchMock)).toBe("/api/reports/maintenance");
    expect(container.querySelector<HTMLSelectElement>('select[name="status"]')?.value).toBe("");
    expect(exportButton().disabled).toBe(false);
    expect(printButton().disabled).toBe(false);
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
    expect(exportButton().disabled).toBe(true);
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
    expect(exportButton().disabled).toBe(true);
    expect(printButton().disabled).toBe(true);
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
