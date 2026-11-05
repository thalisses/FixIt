import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationPage } from "./RegistrationPage";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<RegistrationPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function setField(name: string, value: string): void {
  const field = container.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  );
  if (!field) {
    throw new Error(`Registration field "${name}" was not found.`);
  }

  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(field),
      "value",
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(
      new Event(field instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

async function submitForm(): Promise<void> {
  const form = container.querySelector("form");
  if (!form) {
    throw new Error("Registration form was not found.");
  }

  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

function fillRequiredFields(password = "password123"): void {
  setField("fullName", "Ana Silva");
  setField("email", "ana@example.edu");
  setField("institutionId", "UEM");
  setField("password", password);
  setField("confirmPassword", password);
}

const successfulResponse = () =>
  new Response(
    JSON.stringify({
      data: {
        user: {
          id: "user-1",
          fullName: "Ana Silva",
          email: "ana@example.edu",
          institutionId: "UEM",
          role: "CLIENTE",
        },
      },
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );

describe("registration page", () => {
  it("does not display the account and session notice", () => {
    expect(container.textContent).not.toContain(
      "O cadastro cria uma conta de Cliente e não inicia uma sessão.",
    );
  });

  it("requires a deliberate institution selection and password confirmation", () => {
    setField("fullName", "Ana Silva");
    setField("email", "ana@example.edu");
    setField("password", "password123");
    setField("confirmPassword", "password123");
    const form = container.querySelector("form");
    const institution = container.querySelector<HTMLSelectElement>(
      '[name="institutionId"]',
    );

    expect(institution?.value).toBe("");
    expect(institution?.required).toBe(true);
    expect(form?.checkValidity()).toBe(false);

    setField("institutionId", "UEM");
    expect(form?.checkValidity()).toBe(true);
  });

  it("submits only account fields and confirms success without creating a session", async () => {
    const fetch = vi.fn().mockResolvedValue(successfulResponse());
    vi.stubGlobal("fetch", fetch);
    fillRequiredFields();
    setField("cpf", "123.456.789-00");

    await submitForm();

    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      fullName: "Ana Silva",
      email: "ana@example.edu",
      password: "password123",
      institutionId: "UEM",
      cpf: "123.456.789-00",
    });
    expect(body).not.toHaveProperty("confirmPassword");
    expect(body).not.toHaveProperty("role");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Cadastro concluído",
    );
    expect(container.querySelector('a[href="/login"]')?.textContent).toBe(
      "Acessar conta",
    );
  });

  it("rejects mismatched passwords before sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fillRequiredFields();
    setField("confirmPassword", "another-password");

    await submitForm();

    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "As senhas não correspondem.",
    );
  });

  it("does not show the byte limit and rejects passwords over 72 UTF-8 bytes", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const password = "á".repeat(37);
    fillRequiredFields(password);

    expect(container.textContent).not.toContain("72 bytes");

    await submitForm();

    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "A senha deve ter no máximo 72 bytes em UTF-8.",
    );
  });

  it("shows duplicate email errors from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "EMAIL_ALREADY_EXISTS",
              message: "Já existe uma conta com este e-mail.",
            },
          }),
          { status: 409 },
        ),
      ),
    );
    fillRequiredFields();

    await submitForm();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Já existe uma conta com este e-mail.",
    );
  });
});
