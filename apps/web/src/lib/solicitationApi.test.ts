import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changeSolicitationStatus,
  getSolicitation,
  listSolicitations,
  SolicitationApiError,
  type SolicitationDetail,
  type SolicitationListItem,
} from "./solicitationApi";

const detail: SolicitationDetail = {
  ...({
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
  } satisfies SolicitationListItem),
  descricaoProblema: "Projetor não liga",
  observacoes: null,
};

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


describe("getSolicitation", () => {
  it("loads one request by id", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: { solicitation: detail } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSolicitation(1);

    expect(fetchMock).toHaveBeenCalledWith("/api/solicitations/1", {
      credentials: "same-origin",
    });
    expect(result).toEqual(detail);
  });
});

describe("changeSolicitationStatus", () => {
  it("sends the new status with PATCH", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: { solicitation: { ...detail, status: "EM_ATENDIMENTO" } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await changeSolicitationStatus(1, "EM_ATENDIMENTO");

    expect(fetchMock).toHaveBeenCalledWith("/api/solicitations/1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ status: "EM_ATENDIMENTO" }),
    });
    expect(result.status).toBe("EM_ATENDIMENTO");
  });
});
