import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import type { StatusSolicitacao } from "../../lib/assetApi";
import type { SolicitationHistoryEntry } from "../../lib/solicitationApi";
import { SolicitationTimeline } from "./SolicitationTimeline";
import { formatDateTime } from "./solicitationPresentation";

let container: HTMLDivElement;
let root: Root;

const author = { id: "user-2", fullName: "Bruno Lima" };

const opening: SolicitationHistoryEntry = {
  id: 1,
  tipo: "ABERTURA",
  statusAnterior: null,
  statusNovo: "EM_ABERTO",
  descricao: null,
  dataHora: "2026-11-01T12:00:00.000Z",
  autor: { id: "user-3", fullName: "Clara Reis" },
};
const started: SolicitationHistoryEntry = {
  id: 2,
  tipo: "MUDANCA_STATUS",
  statusAnterior: "EM_ABERTO",
  statusNovo: "EM_ATENDIMENTO",
  descricao: null,
  dataHora: "2026-11-02T12:00:00.000Z",
  autor: author,
};
const note: SolicitationHistoryEntry = {
  id: 3,
  tipo: "OBSERVACAO",
  statusAnterior: null,
  statusNovo: null,
  descricao: "Troquei o disjuntor",
  dataHora: "2026-11-03T12:00:00.000Z",
  autor: author,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Backend {
  role?: string;
  history?(): Response;
  post?(descricao: string): Response;
}

function stubBackend({
  role = "GESTOR",
  history = () => jsonResponse({ data: [opening, started, note] }),
  post = (descricao) =>
    jsonResponse(
      { data: { observation: { ...note, id: 9, descricao } } },
      201,
    ),
}: Backend) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (url === "/api/solicitations/7/history") {
      return history();
    }
    if (url === "/api/solicitations/7/observations" && init?.method === "POST") {
      return post(JSON.parse(String(init.body)).descricao);
    }
    return jsonResponse({ error: { code: "NOT_FOUND", message: "Não." } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function historyCalls(fetchMock: ReturnType<typeof stubBackend>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === "/api/solicitations/7/history",
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function view(
  status: StatusSolicitacao = "EM_ATENDIMENTO",
  responsavelId: string | null = "user-2",
) {
  return (
    <AuthProvider>
      <SolicitationTimeline
        responsavelId={responsavelId}
        solicitationId={7}
        status={status}
      />
    </AuthProvider>
  );
}

async function renderTimeline(
  status?: StatusSolicitacao,
  responsavelId?: string | null,
) {
  await act(async () => {
    root.render(view(status, responsavelId));
  });
  await settle();
}

function textarea(): HTMLTextAreaElement | null {
  return container.querySelector("textarea");
}

function submitButton(): HTMLButtonElement | null {
  return container.querySelector('button[type="submit"]');
}

async function typeObservation(text: string) {
  await act(async () => {
    const field = textarea();
    if (!field) {
      throw new Error("Observation field not rendered.");
    }
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    submitButton()?.click();
  });
  await settle();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("SolicitationTimeline", () => {
  it("shows each record in order with status, date and author (US018 CA1)", async () => {
    stubBackend({});

    await renderTimeline();

    const items = [...container.querySelectorAll("li")];
    expect(items.map((item) => item.dataset.tipo)).toEqual([
      "ABERTURA",
      "MUDANCA_STATUS",
      "OBSERVACAO",
    ]);
    expect(items[1]?.textContent).toContain("Em aberto");
    expect(items[1]?.textContent).toContain("Em atendimento");
    expect(items[1]?.textContent).toContain(formatDateTime(started.dataHora));
    expect(items[1]?.textContent).toContain("por Bruno Lima");
  });

  it("shows the observations with who wrote them (US017)", async () => {
    stubBackend({});

    await renderTimeline();

    const item = container.querySelector('li[data-tipo="OBSERVACAO"]');
    expect(item?.textContent).toContain("Troquei o disjuntor");
    expect(item?.textContent).toContain("por Bruno Lima");
  });

  it("tells when there are no records", async () => {
    stubBackend({ history: () => jsonResponse({ data: [] }) });

    await renderTimeline();

    expect(container.textContent).toContain(
      "Nenhum registro no histórico desta solicitação.",
    );
  });

  it("shows the error and loads again when asked", async () => {
    let attempts = 0;
    stubBackend({
      history: () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse(
              { error: { code: "FAILED", message: "Histórico indisponível." } },
              500,
            )
          : jsonResponse({ data: [opening] });
      },
    });

    await renderTimeline();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Histórico indisponível.",
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".text-action")?.click();
    });
    await settle();

    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("stays hidden from a Cliente and does not ask for the history", async () => {
    const fetchMock = stubBackend({ role: "CLIENTE" });

    await renderTimeline();

    expect(container.textContent).toBe("");
    expect(historyCalls(fetchMock)).toHaveLength(0);
  });

  it("loads the history again when the status changes", async () => {
    const fetchMock = stubBackend({});
    await renderTimeline("EM_ABERTO");
    expect(historyCalls(fetchMock)).toHaveLength(1);

    await act(async () => {
      root.render(view("EM_ATENDIMENTO"));
    });
    await settle();

    expect(historyCalls(fetchMock)).toHaveLength(2);
  });
});

describe("SolicitationObservationForm", () => {
  it("shows the field only to the person in charge", async () => {
    stubBackend({ role: "MANUTENTOR" });
    await renderTimeline("EM_ATENDIMENTO", "user-1");
    expect(textarea()).not.toBeNull();

    await act(async () => {
      root.render(view("EM_ATENDIMENTO", "user-2"));
    });
    await settle();
    expect(textarea()).toBeNull();
  });

  it.each<StatusSolicitacao>(["CONCLUIDO", "CANCELADA"])(
    "hides the field when the solicitation is %s",
    async (status) => {
      stubBackend({});

      await renderTimeline(status, "user-1");

      expect(textarea()).toBeNull();
    },
  );

  it("keeps the button off until there is text", async () => {
    stubBackend({});
    await renderTimeline("EM_ATENDIMENTO", "user-1");
    expect(submitButton()?.disabled).toBe(true);

    await typeObservation("   ");
    expect(submitButton()?.disabled).toBe(true);

    await typeObservation("Troquei a tomada");
    expect(submitButton()?.disabled).toBe(false);
  });

  it("adds the new observation to the end and clears the field (US017 CA2)", async () => {
    const posted: string[] = [];
    stubBackend({
      post: (descricao) => {
        posted.push(descricao);
        return jsonResponse(
          { data: { observation: { ...note, id: 9, descricao } } },
          201,
        );
      },
    });
    await renderTimeline("EM_ATENDIMENTO", "user-1");

    await typeObservation("  Testei com carga  ");
    await submit();

    expect(posted).toEqual(["Testei com carga"]);
    const items = [...container.querySelectorAll("li")];
    expect(items).toHaveLength(4);
    expect(items[2]?.textContent).toContain("Troquei o disjuntor");
    expect(items[3]?.textContent).toContain("Testei com carga");
    expect(textarea()?.value).toBe("");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Observação registrada.",
    );
  });

  it("keeps the text and shows the reason when the server refuses", async () => {
    stubBackend({
      post: () =>
        jsonResponse(
          {
            error: {
              code: "SOLICITATION_CLOSED",
              message: "A solicitação já foi encerrada.",
            },
          },
          409,
        ),
    });
    await renderTimeline("EM_ATENDIMENTO", "user-1");

    await typeObservation("Testei com carga");
    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "A solicitação já foi encerrada.",
    );
    expect(textarea()?.value).toBe("Testei com carga");
    expect(container.querySelectorAll("li")).toHaveLength(3);
  });

  it("shows the message of the invalid field", async () => {
    stubBackend({
      post: () =>
        jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Dados inválidos.",
              fields: { descricao: "Escreva a observação." },
            },
          },
          422,
        ),
    });
    await renderTimeline("EM_ATENDIMENTO", "user-1");

    await typeObservation("x");
    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Escreva a observação.",
    );
    expect(textarea()?.getAttribute("aria-invalid")).toBe("true");
  });
});
