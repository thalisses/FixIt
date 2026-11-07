import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import type { Asset } from "../lib/assetApi";
import { AssetsPage } from "./AssetsPage";

let container: HTMLDivElement;
let root: Root;

const editForm = 'form[aria-label="Editar bem"]';

const projetor: Asset = {
  id: 1,
  codigoPatrimonial: "PAT-1",
  descricao: "Projetor Epson",
  localizacao: "Bloco C, sala 12",
  estadoConservacao: "BOM",
  dataAquisicao: "2025-03-01",
  garantia: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Backend {
  role?: string;
  list?(url: string): Response;
  post?(body: unknown): Response;
  patch?(url: string, body: unknown): Response;
  solicitations?(url: string): Response;
}

function stubBackend({
  role = "GESTOR",
  list,
  post,
  patch,
  solicitations = () => jsonResponse({ data: [] }),
}: Backend) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

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
    if (url.endsWith("/solicitations")) {
      return solicitations(url);
    }
    if (init?.method === "POST" && post) {
      return post(body);
    }
    if (init?.method === "PATCH" && patch) {
      return patch(url, body);
    }
    if (list) {
      return list(url);
    }
    return jsonResponse({ data: [projetor] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let navigations: string[] = [];

// Faz o papel do App: guarda o endereço e repassa para a página.
function Harness({ initialPath }: { initialPath: string }) {
  const [path, setPath] = useState(initialPath);
  return (
    <AssetsPage
      onLoggedOut={() => {}}
      onNavigate={(next) => {
        navigations.push(next);
        setPath(next);
      }}
      path={path}
    />
  );
}

async function mountPage(initialPath = "/assets") {
  act(() => {
    root.render(
      <AuthProvider>
        <Harness initialPath={initialPath} />
      </AuthProvider>,
    );
  });
  await settle();
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

async function submit(selector = "form.asset-form") {
  const form = container.querySelector<HTMLFormElement>(selector);
  expect(form, selector).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("confirm", vi.fn(() => true));
  navigations = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AssetsPage list", () => {
  it("shows the registered assets (US005 CA1)", async () => {
    stubBackend({});

    await mountPage();

    expect(container.querySelector("h1")?.textContent).toBe("Patrimônio");
    const row = container.querySelector("tbody tr")?.textContent;
    expect(row).toContain("PAT-1");
    expect(row).toContain("Projetor Epson");
    expect(row).toContain("Bloco C, sala 12");
    expect(row).toContain("Bom");
  });

  it("shows a message instead of an empty table (US005 CA3)", async () => {
    stubBackend({ list: () => jsonResponse({ data: [] }) });

    await mountPage();

    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("Nenhum bem cadastrado ainda.");
  });

  it("searches by the typed term and offers to clear it (US005 CA1)", async () => {
    const fetchMock = stubBackend({
      list: (url) =>
        jsonResponse({ data: url.includes("busca") ? [] : [projetor] }),
    });
    await mountPage();

    setValue('input[type="search"]', "dell");
    await submit('form[role="search"]');

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets?busca=dell",
      expect.anything(),
    );
    expect(container.textContent).toContain("Nenhum bem encontrado para “dell”.");

    await clickButton("Limpar busca");

    expect(container.querySelector("tbody tr")?.textContent).toContain("PAT-1");
  });

  it("offers a retry when the list fails", async () => {
    let attempts = 0;
    stubBackend({
      list: () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse(
              { error: { code: "X", message: "Falha ao carregar." } },
              500,
            )
          : jsonResponse({ data: [projetor] });
      },
    });
    await mountPage();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Falha ao carregar.",
    );

    await clickButton("Tentar novamente");

    expect(container.querySelector("tbody tr")).not.toBeNull();
  });

  it("checks the session again when the API answers 401", async () => {
    const fetchMock = stubBackend({
      list: () =>
        jsonResponse(
          { error: { code: "UNAUTHENTICATED", message: "Sem sessão." } },
          401,
        ),
    });

    await mountPage();

    const sessionCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/sessions/current",
    );
    expect(sessionCalls.length).toBeGreaterThan(1);
  });
});

describe("AssetsPage registration", () => {
  it("registers an asset and shows it in the list (US004 CA1)", async () => {
    const created = { ...projetor, id: 2, codigoPatrimonial: "PAT-2" };
    const saved: Asset[] = [projetor];
    const fetchMock = stubBackend({
      list: () => jsonResponse({ data: saved }),
      post: () => {
        saved.push(created);
        return jsonResponse({ data: { asset: created } }, 201);
      },
    });
    await mountPage();
    await clickButton("Cadastrar bem");

    setValue('input[name="codigoPatrimonial"]', "PAT-2");
    setValue('input[name="descricao"]', "Projetor Epson");
    setValue('input[name="localizacao"]', "Bloco C, sala 12");
    setValue('select[name="estadoConservacao"]', "BOM");
    await submit();

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      codigoPatrimonial: "PAT-2",
      descricao: "Projetor Epson",
      localizacao: "Bloco C, sala 12",
      estadoConservacao: "BOM",
      dataAquisicao: null,
      garantia: null,
    });
    expect(container.textContent).toContain("Bem PAT-2 cadastrado.");
    expect(container.querySelector("tbody")?.textContent).toContain("PAT-2");
  });

  it("shows which fields are missing and stays on the form (US004 CA3)", async () => {
    stubBackend({
      post: () =>
        jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Dados do bem patrimonial inválidos.",
              fields: {
                descricao: "Descrição é obrigatória.",
                localizacao: "Localização é obrigatória.",
              },
            },
          },
          422,
        ),
    });
    await mountPage();
    await clickButton("Cadastrar bem");

    await submit();

    expect(container.querySelector("h1")?.textContent).toBe("Cadastrar bem");
    expect(container.textContent).toContain("Descrição é obrigatória.");
    expect(container.textContent).toContain("Localização é obrigatória.");
    const descricao = container.querySelector('input[name="descricao"]');
    expect(descricao?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(descricao);
  });

  it("points to the code field when it already exists (US004 CA2)", async () => {
    stubBackend({
      post: () =>
        jsonResponse(
          {
            error: {
              code: "ASSET_CODE_ALREADY_EXISTS",
              message: "Código patrimonial já cadastrado.",
            },
          },
          409,
        ),
    });
    await mountPage();
    await clickButton("Cadastrar bem");
    setValue('input[name="codigoPatrimonial"]', "PAT-1");

    await submit();

    expect(
      container.querySelector("#codigoPatrimonial-error")?.textContent,
    ).toBe("Código patrimonial já cadastrado.");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="codigoPatrimonial"]',
      )?.value,
    ).toBe("PAT-1");
  });

  it("goes back to the list when cancelled", async () => {
    stubBackend({});
    await mountPage();
    await clickButton("Cadastrar bem");

    await clickButton("Cancelar");

    expect(container.querySelector("h1")?.textContent).toBe("Patrimônio");
  });
});

describe("AssetsPage detail", () => {
  it("shows the real data and an empty history", async () => {
    stubBackend({});
    await mountPage();

    await clickButton("Ver ficha de PAT-1");

    expect(container.querySelector("h1")?.textContent).toBe("Projetor Epson");
    expect(container.textContent).toContain("Bloco C, sala 12");
    expect(container.textContent).toContain("01/03/2025");
    expect(container.textContent).toContain("Não informada");
    expect(container.textContent).toContain(
      "Nenhuma manutenção registrada para este bem.",
    );
  });

  it("saves the changes and shows them immediately (US005 CA2)", async () => {
    const updated: Asset = {
      ...projetor,
      localizacao: "Bloco A, sala 3",
      estadoConservacao: "RUIM",
    };
    const fetchMock = stubBackend({
      patch: () => jsonResponse({ data: { asset: updated } }),
    });
    await mountPage();
    await clickButton("Ver ficha de PAT-1");
    await clickButton("Editar bem");

    setValue(`${editForm} input[name="localizacao"]`, "Bloco A, sala 3");
    setValue(`${editForm} select[name="estadoConservacao"]`, "RUIM");
    await submit(editForm);

    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(patchCall?.[0]).toBe("/api/assets/1");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      codigoPatrimonial: "PAT-1",
      descricao: "Projetor Epson",
      localizacao: "Bloco A, sala 3",
      estadoConservacao: "RUIM",
      dataAquisicao: "2025-03-01",
      garantia: null,
    });
    expect(container.querySelector('form[aria-label="Editar bem"]')).toBeNull();
    expect(container.querySelector(".asset-location")?.textContent).toBe(
      "Bloco A, sala 3",
    );
    expect(container.textContent).toContain("Ruim");
    expect(container.textContent).toContain("Alterações salvas.");
  });

  it("keeps the form open and shows the error of a refused edit", async () => {
    stubBackend({
      patch: () =>
        jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Dados do bem patrimonial inválidos.",
              fields: { localizacao: "Localização é obrigatória." },
            },
          },
          422,
        ),
    });
    await mountPage();
    await clickButton("Ver ficha de PAT-1");
    await clickButton("Editar bem");

    setValue(`${editForm} input[name="localizacao"]`, "  ");
    await submit(editForm);

    expect(container.querySelector("#localizacao-error")?.textContent).toBe(
      "Localização é obrigatória.",
    );
    expect(container.querySelector(".asset-location")?.textContent).toBe(
      "Bloco C, sala 12",
    );
  });

  it("opens the edit form with all the current data", async () => {
    stubBackend({});
    await mountPage();
    await clickButton("Ver ficha de PAT-1");
    await clickButton("Editar bem");

    const value = (name: string) =>
      container.querySelector<HTMLInputElement | HTMLSelectElement>(
        `${editForm} [name="${name}"]`,
      )?.value;

    expect(value("codigoPatrimonial")).toBe("PAT-1");
    expect(value("descricao")).toBe("Projetor Epson");
    expect(value("localizacao")).toBe("Bloco C, sala 12");
    expect(value("estadoConservacao")).toBe("BOM");
    expect(value("dataAquisicao")).toBe("2025-03-01");
    expect(value("garantia")).toBe("");
  });

  it("corrects the code and the description and shows them", async () => {
    const updated: Asset = {
      ...projetor,
      codigoPatrimonial: "PAT-1A",
      descricao: "Projetor Epson X05",
      dataAquisicao: null,
    };
    const fetchMock = stubBackend({
      patch: () => jsonResponse({ data: { asset: updated } }),
    });
    await mountPage();
    await clickButton("Ver ficha de PAT-1");
    await clickButton("Editar bem");

    setValue(`${editForm} input[name="codigoPatrimonial"]`, "PAT-1A");
    setValue(`${editForm} input[name="descricao"]`, "Projetor Epson X05");
    setValue(`${editForm} input[name="dataAquisicao"]`, "");
    await submit(editForm);

    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      codigoPatrimonial: "PAT-1A",
      descricao: "Projetor Epson X05",
      dataAquisicao: null,
    });
    expect(container.querySelector("h1")?.textContent).toBe(
      "Projetor Epson X05",
    );
    expect(container.textContent).toContain("Ficha de PAT-1A");
  });

  it("points to the code field when another asset already uses it", async () => {
    stubBackend({
      patch: () =>
        jsonResponse(
          {
            error: {
              code: "ASSET_CODE_ALREADY_EXISTS",
              message: "Código patrimonial já cadastrado.",
            },
          },
          409,
        ),
    });
    await mountPage();
    await clickButton("Ver ficha de PAT-1");
    await clickButton("Editar bem");

    setValue(`${editForm} input[name="codigoPatrimonial"]`, "PAT-2");
    await submit(editForm);

    expect(
      container.querySelector("#codigoPatrimonial-error")?.textContent,
    ).toBe("Código patrimonial já cadastrado.");
    expect(container.querySelector("h1")?.textContent).toBe("Projetor Epson");
  });

  it("discards the changes when the edit is cancelled", async () => {
    const fetchMock = stubBackend({});
    await mountPage();
    await clickButton("Ver ficha de PAT-1");
    await clickButton("Editar bem");
    setValue(`${editForm} input[name="descricao"]`, "Outra");

    await clickButton("Cancelar");

    expect(container.querySelector(editForm)).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Projetor Epson");
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(false);
  });
});

describe("AssetsPage maintenance history", () => {
  const solicitations = [
    {
      id: 4,
      data: "2026-09-01T12:00:00.000Z",
      tipoProblema: "ELETRICA",
      status: "CONCLUIDO",
    },
    {
      // 22h30 do dia 20 em Brasília, já dia 21 em UTC.
      id: 9,
      data: "2026-10-21T01:30:00.000Z",
      tipoProblema: "INFORMATICA",
      status: "EM_ATENDIMENTO",
    },
  ];

  function historyRows() {
    return Array.from(
      container.querySelectorAll('[aria-labelledby="asset-history-title"] tbody tr'),
    ).map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent),
    );
  }

  it("lists the date, problem type and status in order (US006 CA1)", async () => {
    const fetchMock = stubBackend({
      solicitations: () => jsonResponse({ data: solicitations }),
    });
    await mountPage();

    await clickButton("Ver ficha de PAT-1");

    expect(historyRows()).toEqual([
      ["01/09/2026", "Elétrica", "Concluído"],
      ["20/10/2026", "Informática", "Em atendimento"],
    ]);
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url) === "/api/assets/1/solicitations",
      ),
    ).toBe(true);
    expect(container.textContent).not.toContain("Nenhuma manutenção");
  });

  it("offers a retry when the history fails", async () => {
    let attempts = 0;
    stubBackend({
      solicitations: () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse(
              { error: { code: "INTERNAL_SERVER_ERROR", message: "Ocorreu um erro interno." } },
              500,
            )
          : jsonResponse({ data: solicitations });
      },
    });
    await mountPage();
    await clickButton("Ver ficha de PAT-1");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Ocorreu um erro interno.",
    );

    await clickButton("Tentar novamente");

    expect(historyRows()).toHaveLength(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("checks the session again when the history answers 401", async () => {
    const fetchMock = stubBackend({
      solicitations: () =>
        jsonResponse(
          { error: { code: "UNAUTHENTICATED", message: "Sem sessão." } },
          401,
        ),
    });
    await mountPage();
    const before = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/sessions/current",
    ).length;

    await clickButton("Ver ficha de PAT-1");

    const after = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/sessions/current",
    ).length;
    expect(after).toBeGreaterThan(before);
  });
});

describe("AssetsPage addresses", () => {
  it("gives the asset page its own address and goes back to the list", async () => {
    stubBackend({});
    await mountPage();

    await clickButton("Ver ficha de PAT-1");
    expect(navigations.at(-1)).toBe("/assets/1");

    await clickButton("Voltar para Patrimônio");
    expect(navigations.at(-1)).toBe("/assets");
    expect(container.querySelector("h1")?.textContent).toBe("Patrimônio");
  });

  it("opens the asset page straight from its address, as after a reload", async () => {
    stubBackend({});
    await mountPage("/assets/1");

    expect(container.querySelector("h1")?.textContent).toBe("Projetor Epson");
  });

  it("explains when the address points to an asset that does not exist", async () => {
    stubBackend({});
    await mountPage("/assets/99");

    expect(container.querySelector("h1")?.textContent).toBe("Bem não encontrado");
    await clickButton("Voltar para Patrimônio");
    expect(navigations.at(-1)).toBe("/assets");
  });

  it("gives the registration form its own address", async () => {
    stubBackend({});
    await mountPage();

    await clickButton("Cadastrar bem");

    expect(navigations.at(-1)).toBe("/assets/novo");
    expect(container.querySelector("h1")?.textContent).toBe("Cadastrar bem");
  });
});

describe("AssetsPage unsaved changes", () => {
  it("leaves an untouched form without asking", async () => {
    stubBackend({});
    await mountPage("/assets/novo");

    await clickButton("Voltar para Patrimônio");

    expect(window.confirm).not.toHaveBeenCalled();
    expect(navigations.at(-1)).toBe("/assets");
  });

  it("asks before discarding a new asset and stays when refused", async () => {
    stubBackend({});
    vi.mocked(window.confirm).mockReturnValue(false);
    await mountPage("/assets/novo");
    setValue('input[name="codigoPatrimonial"]', "PAT-9");

    await clickButton("Voltar para Patrimônio");

    expect(window.confirm).toHaveBeenCalledWith(
      "Você tem alterações não salvas. Deseja sair sem salvar?",
    );
    expect(navigations).toEqual([]);
    expect(container.querySelector("h1")?.textContent).toBe("Cadastrar bem");
  });

  it("discards a new asset when the person confirms", async () => {
    stubBackend({});
    await mountPage("/assets/novo");
    setValue('input[name="codigoPatrimonial"]', "PAT-9");

    await clickButton("Cancelar");

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(navigations.at(-1)).toBe("/assets");
  });

  it("asks before closing an edit with changes", async () => {
    stubBackend({});
    vi.mocked(window.confirm).mockReturnValue(false);
    await mountPage("/assets/1");
    await clickButton("Editar bem");
    setValue('input[name="localizacao"]', "Sala 9");

    await clickButton("Cancelar");

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(container.querySelector(editForm)).not.toBeNull();
  });
});

describe("AssetsPage navigation", () => {
  it("shows Usuários only to a Gestor", async () => {
    stubBackend({ role: "MANUTENTOR" });
    await mountPage();
    const links = () =>
      Array.from(
        container.querySelectorAll('nav[aria-label="Navegação principal"] a'),
      ).map(
        (link) => link.textContent,
      );

    expect(links()).toEqual(["Início", "Solicitações", "Patrimônio"]);

    act(() => root.unmount());
    root = createRoot(container);
    stubBackend({ role: "GESTOR" });
    await mountPage();

    expect(links()).toEqual([
      "Início",
      "Solicitações",
      "Patrimônio",
      "Usuários",
    ]);
  });
});
