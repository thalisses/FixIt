import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import type { SolicitationDetail as Detail } from "../../lib/solicitationApi";
import { SolicitationDetail } from "./SolicitationDetail";

let container: HTMLDivElement;
let root: Root;

const detail: Detail = {
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
  descricaoProblema: "Projetor não liga",
  observacoes: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Backend {
  role?: string;
  userId?: string;
  request?: Detail;
  statusPatch?(body: unknown): Detail;
  priorityPatch?(body: unknown): Detail;
}

function stubBackend({
  role = "GESTOR",
  userId = "user-1",
  request = detail,
  statusPatch,
  priorityPatch,
}: Backend) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/sessions/current") {
      return jsonResponse({
        data: {
          user: {
            id: userId,
            fullName: "Ana Silva",
            email: "ana@example.edu",
            role,
          },
        },
      });
    }
    if (url === "/api/solicitations/1/status" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return jsonResponse({
        data: { solicitation: statusPatch ? statusPatch(body) : request },
      });
    }
    if (url === "/api/solicitations/1/priority" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return jsonResponse({
        data: { solicitation: priorityPatch ? priorityPatch(body) : request },
      });
    }
    if (url === "/api/solicitations/1/history") {
      return jsonResponse({ data: [] });
    }
    if (url === "/api/solicitations/1") {
      return jsonResponse({ data: { solicitation: request } });
    }
    return jsonResponse({ error: { code: "NOT_FOUND", message: "Não." } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountDetail() {
  act(() => {
    root.render(
      <AuthProvider>
        <SolicitationDetail id={1} onBack={() => {}} />
      </AuthProvider>,
    );
  });
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

describe("SolicitationDetail", () => {
  it("shows the request data and the timeline fields", async () => {
    stubBackend({});
    await mountDetail();

    expect(container.textContent).toContain("#CH-2026-0001");
    expect(container.textContent).toContain("Bloco C, sala 12");
    expect(container.textContent).toContain("Bruno Souza");
    expect(container.textContent).toContain("Projetor Epson");
    expect(container.textContent).toContain("Projetor não liga");
    expect(container.textContent).toContain("Em aberto");
  });

  it("lets a Gestor start the attendance", async () => {
    const fetchMock = stubBackend({
      statusPatch: () => ({ ...detail, status: "EM_ATENDIMENTO" }),
    });
    await mountDetail();

    await clickButton("Iniciar atendimento");
    expect(container.textContent).toContain("Confirmar a mudança");

    await clickButton("Confirmar");

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/solicitations/1/status" &&
        init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      status: "EM_ATENDIMENTO",
    });
    expect(container.textContent).toContain("Atendimento iniciado.");
  });

  it("does not show the action to a Cliente", async () => {
    stubBackend({ role: "CLIENTE", userId: "user-2" });
    await mountDetail();

    expect(container.textContent).not.toContain("Iniciar atendimento");
    expect(container.textContent).not.toContain("Salvar prioridade");
  });

  it("lets a Gestor change the priority (US015)", async () => {
    const fetchMock = stubBackend({
      priorityPatch: () => ({ ...detail, prioridade: "ALTA" }),
    });
    await mountDetail();

    setValue('select[name="prioridade"]', "ALTA");
    await clickButton("Salvar prioridade");

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/solicitations/1/priority" &&
        init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      prioridade: "ALTA",
    });
    expect(container.textContent).toContain("Prioridade atualizada.");
  });

  it("shows the action to the assigned Manutentor and hides it otherwise", async () => {
    stubBackend({
      role: "MANUTENTOR",
      userId: "user-3",
      request: {
        ...detail,
        responsavel: { id: "user-3", fullName: "Carla Lima" },
      },
    });
    await mountDetail();
    expect(container.textContent).toContain("Iniciar atendimento");

    act(() => root.unmount());
    root = createRoot(container);
    container.innerHTML = "";
    stubBackend({
      role: "MANUTENTOR",
      userId: "user-3",
      request: detail,
    });
    await mountDetail();
    expect(container.textContent).not.toContain("Iniciar atendimento");
  });
});
