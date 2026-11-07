import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listSolicitations,
  SolicitationApiError,
  type SolicitationListItem,
} from "./solicitationApi";

const item: SolicitationListItem = {
  id: 1,
  data: "2026-11-07T12:00:00.000Z",
  local: "Bloco C",
  tipoProblema: "INFORMATICA",
  setorResponsavel: "TI",
  urgencia: "ALTA",
  prioridade: "MEDIA",
  status: "EM_ABERTO",
  dataConclusao: null,
  solicitante: { id: "user-1", fullName: "Ana" },
  responsavel: null,
  bem: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listSolicitations", () => {
  it("builds the query string and parses the page", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [item],
        pagination: {
          page: 2,
          pageSize: 10,
          totalItems: 21,
          totalPages: 3,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await listSolicitations({
      status: "EM_ABERTO",
      setor: " TI ",
      tipo: "INFORMATICA",
      prioridade: "ALTA",
      de: "2026-11-01",
      ate: "2026-11-30",
      semResponsavel: true,
      page: 2,
      pageSize: 10,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/solicitations?status=EM_ABERTO&setor=TI&tipo=INFORMATICA" +
        "&prioridade=ALTA&de=2026-11-01&ate=2026-11-30" +
        "&semResponsavel=true&page=2&pageSize=10",
      { credentials: "same-origin" },
    );
    expect(page).toEqual({
      data: [item],
      pagination: {
        page: 2,
        pageSize: 10,
        totalItems: 21,
        totalPages: 3,
      },
    });
  });

  it("omits empty filters", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listSolicitations({ status: "", setor: "   ", tipo: "" });

    expect(fetchMock).toHaveBeenCalledWith("/api/solicitations", {
      credentials: "same-origin",
    });
  });

  it("throws a typed error with the API fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Filtros inválidos.",
              fields: { status: "Status inválido." },
            },
          },
          422,
        ),
      ),
    );

    await expect(listSolicitations()).rejects.toMatchObject({
      name: "SolicitationApiError",
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Filtros inválidos.",
      fields: { status: "Status inválido." },
    });
  });

  it("rejects a response without valid data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: "x" })));

    await expect(listSolicitations()).rejects.toBeInstanceOf(
      SolicitationApiError,
    );
    await expect(listSolicitations()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
