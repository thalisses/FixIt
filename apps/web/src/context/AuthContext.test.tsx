import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

let container: HTMLDivElement;
let root: Root;

function SessionProbe() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return <p role="status">Verificando</p>;
  }

  return (
    <div>
      <p role="status">{user ? `Autenticado: ${user.email}` : "Sem sessão"}</p>
      {user && (
        <button onClick={() => void logout()} type="button">
          Sair
        </button>
      )}
    </div>
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

describe("authentication context", () => {
  it("rehydrates the current session and clears it after server logout", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              user: {
                id: "user-1",
                fullName: "Ana Silva",
                email: "ana@example.edu",
                role: "CLIENTE",
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await act(async () => {
      root.render(
        <AuthProvider>
          <SessionProbe />
        </AuthProvider>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Autenticado: ana@example.edu",
    );

    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/sessions/current",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/current",
      expect.objectContaining({
        method: "DELETE",
        credentials: "same-origin",
      }),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Sem sessão",
    );
  });
});
