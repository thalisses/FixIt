import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMaintenanceReport,
  ReportApiError,
  type MaintenanceReport,
} from "./reportApi";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getMaintenanceReport", () => {
  it("loads the report", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: report }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMaintenanceReport()).resolves.toEqual(report);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/maintenance", {
      credentials: "same-origin",
    });
  });

  it("builds the filter query string", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: report }));
    vi.stubGlobal("fetch", fetchMock);

    await getMaintenanceReport({
      de: "2026-11-01",
      ate: "2026-11-30",
      setor: " TI ",
      tipo: "INFORMATICA",
      status: "CONCLUIDO",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/maintenance?de=2026-11-01&ate=2026-11-30" +
        "&setor=TI&tipo=INFORMATICA&status=CONCLUIDO",
      { credentials: "same-origin" },
    );
  });

  it("throws a typed error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: { code: "FORBIDDEN", message: "Sem acesso." } },
          403,
        ),
      ),
    );

    await expect(getMaintenanceReport()).rejects.toMatchObject({
      name: "ReportApiError",
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("rejects an invalid response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: {} })));

    await expect(getMaintenanceReport()).rejects.toBeInstanceOf(
      ReportApiError,
    );
  });
});
