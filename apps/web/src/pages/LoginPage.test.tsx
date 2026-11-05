import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { LoginPage } from "./LoginPage";

let container: HTMLDivElement;
let root: Root;

function LoginHarness() {
  const { user } = useAuth();
  return user ? (
    <p role="status">Perfil autenticado: {user.role}</p>
  ) : (
    <LoginPage />
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
  vi.unstubAllGlobals();
});

async function renderLogin(): Promise<void> {
  await act(async () => {
    root.render(
      <AuthProvider>
        <LoginHarness />
      </AuthProvider>,
    );
    await Promise.resolve();
  });
}

function setField(name: string, value: string): void {
  const field = container.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );
  if (!field) {
    throw new Error(`Login field "${name}" was not found.`);
  }

  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(field),
      "value",
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitForm(): Promise<void> {
  const form = container.querySelector("form");
  if (!form) {
    throw new Error("Login form was not found.");
  }

  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
}

const authenticatedBody = {
  data: {
    user: {
      id: "user-1",
      fullName: "Ana Silva",
      email: "ana@example.edu",
      role: "CLIENTE",
    },
  },
};

describe("login page", () => {
  it("summarizes FixIt's purpose for a general organization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));
    await renderLogin();

    expect(container.querySelector("h2")?.textContent).toBe(
      "Gestão de manutenção simples e eficiente para sua organização.",
    );
    expect(container.textContent).toContain(
      "O FixIt conecta equipes às operações de manutenção da organização.",
    );
    expect(container.textContent).toContain("Solicitações Simplificadas");
    expect(container.textContent).toContain("Acompanhamento Transparente");
    expect(container.textContent).toContain("Gestão de Ativos");
    expect(container.textContent).not.toContain("campus universitário");
  });

  it("does not display the institutional portal eyebrow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));
    await renderLogin();

    expect(container.textContent).not.toContain("Portal institucional FixIt");
  });

  it("submits credentials, remembers the choice, and updates the session", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, authenticatedBody));
    vi.stubGlobal("fetch", fetch);
    await renderLogin();

    setField("email", "ana@example.edu");
    setField("password", "password123");
    const rememberMe = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    act(() => rememberMe?.click());

    await submitForm();

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/sessions",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          email: "ana@example.edu",
          password: "password123",
          rememberMe: true,
        }),
      }),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Perfil autenticado: CLIENTE",
    );
  });

  it("shows a generic credential message for login failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(
        response(401, {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "E-mail ou senha inválidos.",
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await renderLogin();

    setField("email", "ana@example.edu");
    setField("password", "wrong-password");
    await submitForm();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "E-mail ou senha inválidos.",
    );
  });

  it("toggles password visibility with an accessible control", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));
    await renderLogin();
    setField("password", "password123");

    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Mostrar senha"]',
    );
    act(() => toggle?.click());

    expect(
      container.querySelector<HTMLInputElement>("#login-password")?.type,
    ).toBe("text");
  });
});
