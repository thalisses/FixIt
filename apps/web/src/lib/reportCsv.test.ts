import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ReportsPage } from "../pages/ReportsPage";
import * as reportApi from "./reportApi";
import { generateReportCsv } from "./reportCsv";

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../context/AuthContext", () => {
  const auth = { refresh: vi.fn() };
  return { useAuth: () => auth };
});

const report: reportApi.MaintenanceReport = {
  total: 10,
  byStatus: { CANCELADA: 1, CONCLUIDO: 2, EM_ATENDIMENTO: 3, EM_ABERTO: 4 },
  averageResolutionHours: 36,
  topAssets: [
    { asset: { id: 2, descricao: "Projetor", codigoPatrimonial: "PAT-20" }, count: 5 },
    { asset: { id: 1, descricao: "Ar-condicionado", codigoPatrimonial: "PAT-10" }, count: 3 },
  ],
  hasData: true,
};

it("exporta todos os indicadores e mantém a ordem dos status e do ranking", () => {
  expect(generateReportCsv(report)).toBe([
    "Seção,Indicador,Valor,Posição,Bem,Código patrimonial,Solicitações",
    "Resumo,Total de solicitações,10,,,,",
    "Resumo,Tempo médio até conclusão,1.5 dias,,,,",
    "Solicitações por status,Em aberto,4,,,,",
    "Solicitações por status,Em atendimento,3,,,,",
    "Solicitações por status,Concluídas,2,,,,",
    "Solicitações por status,Canceladas,1,,,,",
    "Bens com mais solicitações,,,1,Projetor,PAT-20,5",
    "Bens com mais solicitações,,,2,Ar-condicionado,PAT-10,3",
  ].join("\r\n"));
});

it("exporta somente os indicadores quando o relatório não tem bens vinculados", () => {
  const csv = generateReportCsv({ ...report, topAssets: [] });

  expect(csv.split("\r\n")).toHaveLength(7);
  expect(csv).not.toContain("Bens com mais solicitações");
});

it("preserva contagens e média com valor zero", () => {
  const csv = generateReportCsv({
    ...report,
    total: 0,
    byStatus: { EM_ABERTO: 0, EM_ATENDIMENTO: 0, CONCLUIDO: 0, CANCELADA: 0 },
    averageResolutionHours: 0,
    topAssets: [],
    hasData: false,
  });

  expect(csv.split("\r\n").slice(1).map((row) => row.split(",")[2])).toEqual([
    "0", "0.0 h", "0", "0", "0", "0",
  ]);
});

it("exporta a mensagem da média quando não há solicitações concluídas", () => {
  expect(generateReportCsv({ ...report, averageResolutionHours: null })).toContain(
    "Resumo,Tempo médio até conclusão,Sem solicitações concluídas,,,,",
  );
});

it("preserva acentos, aspas, vírgulas, quebras de linha e células vazias", () => {
  const csv = generateReportCsv({
    ...report,
    topAssets: [{
      asset: { id: 1, descricao: 'Balança, modelo "A"\r\n2ª edição', codigoPatrimonial: "" },
      count: 1,
    }],
  });

  expect(csv.endsWith(
    'Bens com mais solicitações,,,1,"Balança, modelo ""A""\r\n2ª edição",,1',
  )).toBe(true);
});

it.each([
  ["=1+1", "'=1+1"],
  ["  +1", "'  +1"],
  ["\t\u0001-1", "'\t\u0001-1"],
  ["\u200B@SUM(1)", "'\u200B@SUM(1)"],
  ['\r\n="a,b"', `"'\r\n=""a,b"""`],
  ["\ttexto", "'\ttexto"],
  ["PAT-10", "PAT-10"],
])("protege descrições e códigos de planilha (%j)", (value, expected) => {
  const csv = generateReportCsv({
    ...report,
    topAssets: [{ asset: { id: 1, descricao: value, codigoPatrimonial: value }, count: 1 }],
  });

  expect(csv.endsWith(`Bens com mais solicitações,,,1,${expected},${expected},1`)).toBe(true);
});

it.each([12.34, 24, 36, null])(
  "exporta os mesmos valores que o painel para a média %s",
  async (averageResolutionHours) => {
    const displayedReport = { ...report, averageResolutionHours };
    const load = vi.spyOn(reportApi, "getMaintenanceReport").mockResolvedValue(displayedReport);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(ReportsPage, {
          onLoggedOut: () => {},
          onNavigate: () => {},
        }));
      });

      const rows = generateReportCsv(displayedReport).split("\r\n").slice(1);
      const cards = Array.from(container.querySelectorAll(".report-card, .report-status-card"));
      const panelIndicators = cards.map((card) => [
        card.querySelector("span")?.textContent,
        card.querySelector("strong")?.textContent,
      ]);
      expect(rows.slice(0, 6).map((row) => row.split(",").slice(1, 3))).toEqual(panelIndicators);

      const panelRanking = Array.from(container.querySelectorAll(".report-table tbody tr"))
        .map((row) => Array.from(row.querySelectorAll("td"), (cell) => cell.textContent));
      expect(rows.slice(6).map((row) => row.split(",").slice(3))).toEqual(panelRanking);
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      load.mockRestore();
      vi.unstubAllGlobals();
    }
  },
);
