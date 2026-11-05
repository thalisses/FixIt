import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import type { Asset } from "../lib/assetApi";
import { AssetsPage } from "./AssetsPage";

let container: HTMLDivElement;
let root: Root;

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
}

function stubBackend({ role = "GESTOR", list, post, patch }: Backend) {
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

async function mountPage() {
  act(() => {
    root.render(
      <AuthProvider>
        <AssetsPage onLoggedOut={() => {}} onNavigate={() => {}} />
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
    expect(container.textContent).toContain("Nenhuma manutenção registrada.");
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

    setValue('form[aria-label="Editar bem"] input', "Bloco A, sala 3");
    setValue('form[aria-label="Editar bem"] select', "RUIM");
    await submit('form[aria-label="Editar bem"]');

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          localizacao: "Bloco A, sala 3",
          estadoConservacao: "RUIM",
        }),
      }),
    );
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

    setValue('form[aria-label="Editar bem"] input', "  ");
    await submit('form[aria-label="Editar bem"]');

    expect(container.querySelector("#edit-location-error")?.textContent).toBe(
      "Localização é obrigatória.",
    );
    expect(container.querySelector(".asset-location")?.textContent).toBe(
      "Bloco C, sala 12",
    );
  });
});

describe("AssetsPage navigation", () => {
  it("shows Usuários only to a Gestor", async () => {
    stubBackend({ role: "MANUTENTOR" });
    await mountPage();
    const links = () =>
      Array.from(container.querySelectorAll(".app-nav-link")).map(
        (link) => link.textContent,
      );

    expect(links()).toEqual(["Início", "Patrimônio"]);

    act(() => root.unmount());
    root = createRoot(container);
    stubBackend({ role: "GESTOR" });
    await mountPage();

    expect(links()).toEqual(["Início", "Patrimônio", "Usuários"]);
  });
});
