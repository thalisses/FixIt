import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import type {
  MaintainerCandidate,
  SolicitationDetail as Detail,
} from "../../lib/solicitationApi";
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
  maintainers?: MaintainerCandidate[];
  assignmentPatch?(body: { maintainerId: string }): Detail;
  cancel?(body: { motivo: string }): Detail;
  read?(id: number): Response | Promise<Response>;
  attachments?(id: number): Response | Promise<Response>;
  imageContent?(): Response | Promise<Response>;
}

function stubBackend({
  role = "GESTOR",
  userId = "user-1",
  request = detail,
  statusPatch,
  priorityPatch,
  maintainers = [],
  assignmentPatch,
  cancel,
  read,
  attachments,
  imageContent,
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
    if (url === "/api/solicitations/1/cancel" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return jsonResponse({
        data: { solicitation: cancel ? cancel(body) : request },
      });
    }
    if (url === "/api/solicitations/1/maintainers") {
      return jsonResponse({ data: maintainers });
    }
    if (url === "/api/solicitations/1/assignee" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as {
        maintainerId: string;
      };
      return jsonResponse({
        data: {
          solicitation: assignmentPatch
            ? assignmentPatch(body)
            : request,
        },
      });
    }
    if (url === "/api/solicitations/1/history") {
      return jsonResponse({ data: [] });
    }
    const attachmentList = /^\/api\/solicitations\/(\d+)\/attachments$/.exec(url);
    if (attachmentList) {
      return attachments ? attachments(Number(attachmentList[1])) : jsonResponse({ data: [] });
    }
    if (/^\/api\/solicitations\/\d+\/attachments\/[^/]+\/content$/.test(url)) {
      return imageContent ? imageContent() : new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
    }
    const detailRoute = /^\/api\/solicitations\/(\d+)$/.exec(url);
    if (detailRoute && read) return read(Number(detailRoute[1]));
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

async function mountDetail(id = 1, onBack = () => {}) {
  act(() => {
    root.render(
      <AuthProvider>
        <SolicitationDetail id={id} onBack={onBack} />
      </AuthProvider>,
    );
  });
  await settle();
}

function setValue(selector: string, value: string) {
  const element = container.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(selector);
  expect(element, selector).not.toBeNull();
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
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
  let nextUrl = 0;
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => `blob:detail-${++nextUrl}`);
    static revokeObjectURL = vi.fn();
  });
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
  const image = {
    id: "image-1", nomeOriginal: "evidencia.png", mimeType: "image/png", tamanhoBytes: 3,
    criadoEm: "2026-11-07T12:00:00.000Z",
    contentUrl: "/api/solicitations/1/attachments/image-1/content",
  };

  function fact(label: string) {
    const term = Array.from(container.querySelectorAll("dt")).find((entry) => entry.textContent === label);
    expect(term, label).toBeDefined();
    return term?.nextElementSibling?.textContent;
  }

  it("shows exactly Acesso Negado for a Cliente receiving 403, without request data or child requests", async () => {
    const fetchMock = stubBackend({
      role: "CLIENTE", userId: "other-client",
      read: () => jsonResponse({ error: { code: "FORBIDDEN", message: "Mensagem da API." } }, 403),
    });
    await mountDetail();
    expect(container.querySelector("h1")?.textContent).toBe("Acesso Negado");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Você não tem permissão para visualizar esta solicitação.");
    expect(container.textContent).not.toContain(detail.local);
    expect(container.textContent).not.toContain(detail.descricaoProblema);
    expect(container.textContent).not.toContain(detail.solicitante!.fullName);
    expect(container.querySelector(".solicitation-attachments")).toBeNull();
    expect(container.textContent).not.toContain("Iniciar atendimento");
    expect(container.textContent).not.toContain("Salvar prioridade");
    expect(container.textContent).not.toContain("Histórico");
    expect(fetchMock.mock.calls.some(([url]) => /\/(attachments|history)(\/|$)/.test(String(url)))).toBe(false);
    expect(container.textContent).not.toContain("Tentar novamente");
  });

  it("keeps the expired-session message and revalidates the session for HTTP 401", async () => {
    const fetchMock = stubBackend({
      role: "CLIENTE",
      read: () => jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Sessão inválida." } }, 401),
    });
    await mountDetail();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Sua sessão expirou. Entre novamente.");
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/sessions/current")).toHaveLength(2);
    expect(container.textContent).not.toContain("Acesso Negado");
    expect(container.querySelector(".solicitation-attachments")).toBeNull();
  });

  it("distinguishes a missing solicitation from forbidden access", async () => {
    stubBackend({ read: () => jsonResponse({ error: { code: "SOLICITATION_NOT_FOUND", message: "Não encontrada." } }, 404) });
    await mountDetail();
    expect(container.querySelector("h1")?.textContent).toBe("Solicitação não encontrada");
    expect(container.textContent).not.toContain("Acesso Negado");
    expect(container.querySelector(".solicitation-attachments")).toBeNull();
    expect(container.textContent).not.toContain("Tentar novamente");
  });

  it.each(["network", "500", "503"])("allows retry after a %s failure", async (failure) => {
    let attempts = 0;
    stubBackend({ read: () => {
      if (++attempts > 1) return jsonResponse({ data: { solicitation: detail } });
      if (failure === "network") throw new TypeError("Failed to fetch");
      return jsonResponse({ error: { code: "UNAVAILABLE", message: "Serviço indisponível. Tente novamente." } }, Number(failure));
    } });
    await mountDetail();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(failure === "network"
      ? "Não foi possível conectar ao servidor. Tente novamente."
      : "Serviço indisponível. Tente novamente.");
    expect(container.textContent).not.toContain("Acesso Negado");
    await clickButton("Tentar novamente");
    expect(container.querySelector("h1")?.textContent).toBe(detail.local);
    expect(container.querySelector(".solicitation-attachments")).not.toBeNull();
  });

  it.each(["list", "content"])("does not turn an isolated attachment %s 403 into denied solicitation access", async (failure) => {
    const forbidden = () => jsonResponse({ error: { code: "FORBIDDEN", message: "Sem acesso à imagem." } }, 403);
    stubBackend({
      attachments: () => failure === "list" ? forbidden() : jsonResponse({ data: [image] }),
      imageContent: forbidden,
    });
    await mountDetail();
    expect(container.querySelector("h1")?.textContent).toBe(detail.local);
    expect(container.querySelector('.solicitation-attachments [role="alert"]')?.textContent).toContain("Sem acesso à imagem.");
    expect(container.textContent).not.toContain("Acesso Negado");
    expect(fact("Solicitante")).toBe(detail.solicitante!.fullName);
  });

  it("ignores a late forbidden response after navigating to another ID", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    stubBackend({ role: "CLIENTE", read: (id) => id === 1 ? pending : jsonResponse({ data: { solicitation: { ...detail, id: 2, local: "Bloco D" } } }) });
    await mountDetail(1);
    await mountDetail(2);
    await act(async () => { finish(jsonResponse({ error: { code: "FORBIDDEN", message: "Chamado anterior." } }, 403)); });
    expect(container.querySelector("h1")?.textContent).toBe("Bloco D");
    expect(container.textContent).not.toContain("Acesso Negado");
    expect(container.textContent).not.toContain("Chamado anterior");
  });

  it("clears an existing denied state while the next solicitation is loading", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    stubBackend({ role: "CLIENTE", read: (id) => id === 2 ? pending : jsonResponse({ error: { code: "FORBIDDEN", message: "Não." } }, 403) });
    await mountDetail(1);
    expect(container.querySelector("h1")?.textContent).toBe("Acesso Negado");
    await mountDetail(2);
    expect(container.textContent).toContain("Carregando solicitação");
    expect(container.textContent).not.toContain("Acesso Negado");
    await act(async () => { finish(jsonResponse({ data: { solicitation: { ...detail, id: 2 } } })); });
    expect(container.querySelector("h1")?.textContent).toBe(detail.local);
  });

  it.each([403, 404, 500])("preserves the return action in the HTTP %s error state", async (status) => {
    stubBackend({ read: () => jsonResponse({ error: { code: "FAILED", message: "Falha." } }, status) });
    const onBack = vi.fn();
    await mountDetail(1, onBack);
    await clickButton("Voltar para Solicitações");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows every CA1 field and attachments from the authorized request", async () => {
    stubBackend({
      request: { ...detail, responsavel: { id: "user-3", fullName: "Carla Lima" } },
      attachments: () => jsonResponse({ data: [image] }),
    });
    await mountDetail();
    expect(container.querySelector("h1")?.textContent).toBe(detail.local);
    expect(container.querySelector(".solicitation-detail-subtitle")?.textContent).toContain("Informática");
    expect(fact("Solicitante")).toBe("Bruno Souza");
    expect(fact("Abertura")).toContain("07/11/2026");
    expect(fact("Abertura")).toContain("09:00");
    expect(fact("Responsável")).toBe("Carla Lima");
    expect(fact("Urgência declarada")).toBe("Alta");
    expect(fact("Prioridade de atendimento")).toBe("Média");
    expect(container.querySelector(".asset-page-heading")?.textContent).toContain("Em aberto");
    expect(container.querySelector(".solicitation-asset-detail")?.textContent).toContain("PAT-7");
    expect(container.querySelector(".solicitation-asset-detail")?.textContent).toContain("Projetor Epson");
    expect(container.textContent).toContain("Projetor não liga");
    expect(container.querySelector(".solicitation-attachments img")?.getAttribute("alt")).toContain(image.nomeOriginal);
  });

  it("explains priority, assignee and asset not yet defined", async () => {
    stubBackend({ request: { ...detail, prioridade: null, responsavel: null, bem: null } });
    await mountDetail();
    expect(fact("Prioridade de atendimento")).toBe("Não definida");
    expect(fact("Responsável")).toBe("Não atribuído");
    expect(container.textContent).toContain("Esta solicitação não está vinculada a um bem patrimonial.");
    expect(container.textContent).toContain("Esta solicitação não possui anexos.");
  });

  it("shows attachments for the owning Cliente without querying the timeline", async () => {
    const fetchMock = stubBackend({ role: "CLIENTE", userId: "user-2", attachments: () => jsonResponse({ data: [image] }) });
    await mountDetail();
    expect(container.querySelector(".solicitation-attachments img")).not.toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === image.contentUrl)).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/history"))).toBe(false);
    expect(container.textContent).not.toContain("Salvar prioridade");
  });

  it.each([403, 404])("does not mount or fetch the gallery when details return HTTP %s", async (status) => {
    const fetchMock = stubBackend({ read: () => jsonResponse({ error: { code: "FAILED", message: "Consulta recusada." } }, status) });
    await mountDetail();
    expect(container.querySelector(".solicitation-attachments")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/attachments"))).toBe(false);
  });

  it.each(["list", "content"])("keeps request data visible when attachment %s fails", async (failure) => {
    stubBackend({
      attachments: () => failure === "list"
        ? jsonResponse({ error: { code: "FAILED", message: "Falha nos anexos." } }, 500)
        : jsonResponse({ data: [image] }),
      imageContent: () => jsonResponse({ error: { code: "ATTACHMENT_READ_FAILED", message: "Falha na imagem." } }, 500),
    });
    await mountDetail();
    expect(container.querySelector("h1")?.textContent).toBe(detail.local);
    expect(fact("Solicitante")).toBe("Bruno Souza");
    expect(container.textContent).toContain(detail.descricaoProblema);
    expect(container.querySelector('.solicitation-attachments [role="alert"]')).not.toBeNull();
  });

  it("waits for successful details before fetching attachments and uses the new ID after navigation", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const fetchMock = stubBackend({
      role: "CLIENTE", userId: "user-2",
      read: (id) => id === 2 ? pending : jsonResponse({ data: { solicitation: detail } }),
      attachments: (id) => jsonResponse({ data: [{ ...image, id: `image-${id}`, nomeOriginal: `chamado-${id}.png` }] }),
    });
    await mountDetail();
    expect(container.textContent).toContain("chamado-1.png");
    const oldSignal = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/attachments/image-1/content"))?.[1]?.signal;
    await mountDetail(2);
    expect(container.textContent).toContain("Carregando solicitação");
    expect(container.textContent).not.toContain("chamado-1.png");
    expect(oldSignal?.aborted).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/solicitations/2/attachments")).toBe(false);
    await act(async () => { finish(jsonResponse({ data: { solicitation: { ...detail, id: 2, local: "Bloco D" } } })); });
    await settle();
    expect(container.querySelector("h1")?.textContent).toBe("Bloco D");
    expect(container.textContent).toContain("chamado-2.png");
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/solicitations/2/attachments/image-2/content")).toBe(true);
  });

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
    expect(container.textContent).not.toContain("Cancelar solicitação");
  });

  it("lets a Gestor cancel an open request (US012)", async () => {
    const fetchMock = stubBackend({
      cancel: () => ({ ...detail, status: "CANCELADA" }),
    });
    await mountDetail();

    setValue('textarea[name="motivo"]', "Chamado duplicado");
    await clickButton("Cancelar solicitação");
    expect(container.textContent).toContain("Confirmar o cancelamento");

    await clickButton("Confirmar cancelamento");

    const cancelCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/solicitations/1/cancel" &&
        init?.method === "POST",
    );
    expect(cancelCall).toBeDefined();
    expect(JSON.parse(String(cancelCall?.[1]?.body))).toEqual({
      motivo: "Chamado duplicado",
    });
    expect(container.textContent).toContain("Solicitação cancelada.");
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

  it("shows all maintainers in server order and assigns the selected one", async () => {
    const compatible = {
      id: "33333333-3333-4333-8333-333333333333",
      fullName: "Carla Lima",
      specialty: "INFORMATICA" as const,
    };
    const other = {
      id: "44444444-4444-4444-8444-444444444444",
      fullName: "João Souza",
      specialty: "ELETRICA" as const,
    };
    const fetchMock = stubBackend({
      maintainers: [compatible, other],
      assignmentPatch: () => ({
        ...detail,
        responsavel: { id: compatible.id, fullName: compatible.fullName },
      }),
    });
    await mountDetail();

    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Manutentor responsável"]',
    );
    expect(select).not.toBeNull();
    expect(
      Array.from(select?.options ?? []).map((option) => option.textContent),
    ).toEqual([
      "Selecione",
      "Carla Lima · Informática · Compatível",
      "João Souza · Elétrica",
    ]);

    setValue('select[aria-label="Manutentor responsável"]', compatible.id);
    await clickButton("Atribuir Manutentor");

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/solicitations/1/assignee" &&
        init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      maintainerId: compatible.id,
    });
    expect(container.textContent).toContain("Responsável atualizado.");
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
