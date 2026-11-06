import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { AuthenticatedPage } from "../pages/AuthenticatedPage";
import { AppShell } from "./AppShell";

let container: HTMLDivElement;
let root: Root;

function stubSession(role = "GESTOR") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/sessions/current" && init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return new Response(
      JSON.stringify({
        data: {
          user: {
            id: "user-1",
            fullName: "Ana Maria Silva",
            email: "ana@uem.br",
            role,
          },
        },
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountShell(activePath = "/assets") {
  const onNavigate = vi.fn();
  const onLoggedOut = vi.fn();
  act(() => {
    root.render(
      <AuthProvider>
        <AppShell
          activePath={activePath}
          onLoggedOut={onLoggedOut}
          onNavigate={onNavigate}
        >
          <h1>Conteúdo</h1>
        </AppShell>
      </AuthProvider>,
    );
  });
  await settle();
  return { onNavigate, onLoggedOut };
}

function sidebar() {
  return container.querySelector<HTMLElement>(".app-sidebar");
}

function navLinks() {
  return Array.from(
    container.querySelectorAll<HTMLAnchorElement>(
      'nav[aria-label="Navegação principal"] a',
    ),
  );
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AppShell menu", () => {
  it("marks the current area in the menu and in the header", async () => {
    stubSession();
    await mountShell("/assets/4");

    const current = navLinks().find((link) => link.getAttribute("aria-current"));
    expect(current?.textContent).toBe("Patrimônio");
    expect(container.querySelector(".app-section")?.textContent).toBe(
      "Patrimônio",
    );
  });

  it("shows only the areas of each role", async () => {
    stubSession("CLIENTE");
    await mountShell("/");

    expect(navLinks().map((link) => link.textContent)).toEqual(["Início"]);
  });

  it("expands when the mouse comes near and closes after it leaves", async () => {
    stubSession();
    await mountShell();
    vi.useFakeTimers();

    act(() => {
      sidebar()?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(100));
    expect(sidebar()?.hasAttribute("data-expanded")).toBe(true);

    act(() => {
      sidebar()?.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    act(() => vi.advanceTimersByTime(100));
    expect(sidebar()?.hasAttribute("data-expanded")).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(sidebar()?.hasAttribute("data-expanded")).toBe(false);
  });

  it("navigates inside the app instead of reloading the page", async () => {
    stubSession();
    const { onNavigate } = await mountShell();
    const users = navLinks().find((link) => link.textContent === "Usuários");

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      users?.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith("/users");
  });

  it("opens the mobile menu, focuses the first area and closes with Escape", async () => {
    stubSession();
    await mountShell();
    const menuButton = container.querySelector<HTMLButtonElement>(
      ".app-menu-button",
    );

    await act(async () => menuButton?.click());

    expect(menuButton?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(navLinks()[0]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuButton);
  });

  it("offers a skip link to the content", async () => {
    stubSession();
    await mountShell();

    const skip = container.querySelector<HTMLAnchorElement>(".app-skip-link");
    expect(skip?.getAttribute("href")).toBe("#conteudo");
    expect(container.querySelector("#conteudo h1")?.textContent).toBe("Conteúdo");
  });

  it("signs out from the menu", async () => {
    const fetchMock = stubSession();
    const { onLoggedOut } = await mountShell();
    const logout = container.querySelector<HTMLButtonElement>(".app-logout");

    await act(async () => logout?.click());
    await settle();

    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(true);
    expect(onLoggedOut).toHaveBeenCalled();
  });
});

describe("Início", () => {
  async function mountHome(role: string) {
    stubSession(role);
    act(() => {
      root.render(
        <AuthProvider>
          <AuthenticatedPage onLoggedOut={() => {}} onNavigate={() => {}} />
        </AuthProvider>,
      );
    });
    await settle();
  }

  function shortcuts() {
    return Array.from(container.querySelectorAll(".home-shortcut strong")).map(
      (title) => title.textContent,
    );
  }

  it("greets by first name inside the same layout", async () => {
    await mountHome("GESTOR");

    expect(container.querySelector("h1")?.textContent).toBe("Olá, Ana");
    expect(container.querySelector(".app-sidebar")).not.toBeNull();
  });

  it.each([
    ["GESTOR", ["Patrimônio", "Usuários"]],
    ["MANUTENTOR", ["Patrimônio"]],
    ["CLIENTE", []],
  ])("shows the shortcuts of a %s", async (role, expected) => {
    await mountHome(role);

    expect(shortcuts()).toEqual(expected);
  });

  it("tells a Cliente what is still coming", async () => {
    await mountHome("CLIENTE");

    expect(container.querySelector(".home-note")?.textContent).toContain(
      "abertura de solicitações",
    );
  });
});
