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
