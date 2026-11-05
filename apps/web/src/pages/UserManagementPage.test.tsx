import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import type { ManagedUser } from "../lib/authApi";
import { UserManagementPage } from "./UserManagementPage";

let container: HTMLDivElement;
let root: Root;

const manager = {
  id: "manager-1",
  fullName: "Bruno Souza",
  email: "bruno@example.edu",
  role: "GESTOR",
};
const client: ManagedUser = {
  id: "client-1",
  fullName: "Ana Silva",
  email: "ana@example.edu",
  institutionId: "UEM",
  role: "CLIENTE",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function mountPage() {
  act(() => {
    root.render(
      <AuthProvider>
        <UserManagementPage onBack={() => {}} onLoggedOut={() => {}} />
      </AuthProvider>,
    );
  });
}

async function settleEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

describe("user management page", () => {
  it("does not load or render user administration for non-Gestor profiles", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          user: {
            ...manager,
            role: "CLIENTE",
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    mountPage();
    await settleEffects();

    expect(container.textContent).toBe("");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/sessions/current");
  });

  it("confirms role changes and displays the updated profile", async () => {
    const updatedClient = { ...client, role: "GESTOR" };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { user: manager } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [client],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 1,
            totalPages: 1,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { user: updatedClient } }),
      );
    vi.stubGlobal("fetch", fetch);

    mountPage();
    await settleEffects();

    expect(container.textContent).toContain("Gerenciar usuários");
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Novo perfil para Ana Silva"]',
    );
    expect(select).not.toBeNull();

    await act(async () => {
      if (select) {
        select.value = "GESTOR";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    const prepareButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Alterar perfil",
    );
    expect(prepareButton).toBeDefined();
    await act(async () => prepareButton?.click());
    expect(container.textContent).toContain("Alterar Ana Silva para Gestor?");

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Confirmar",
    );
    await act(async () => {
      confirmButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Perfil atualizado para Gestor.");
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/users/client-1/role",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "GESTOR" }),
      }),
    );
  });
});
