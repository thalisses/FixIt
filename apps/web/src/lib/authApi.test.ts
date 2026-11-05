import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  deleteCurrentSession,
  changeUserRole,
  getCurrentSession,
  listUsers,
  registerUser,
  SessionApiError,
  UserManagementApiError,
  type RegisterUserInput,
} from "./authApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

const registration: RegisterUserInput = {
  fullName: "Ana Silva",
  email: "ana@example.edu",
  password: "password123",
  institutionId: "UEM",
};

describe("registration API client", () => {
  it("posts the registration and returns the public user", async () => {
    const fetch = vi.fn().mockResolvedValue(
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
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(registerUser(registration)).resolves.toEqual({
      id: "user-1",
      fullName: "Ana Silva",
      email: "ana@example.edu",
      institutionId: "UEM",
      role: "CLIENTE",
    });

    expect(fetch).toHaveBeenCalledWith("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(registration),
    });
  });

  describe("user management API client", () => {
    const page = {
      data: [
        {
          id: "user-1",
          fullName: "Ana Silva",
          email: "ana@example.edu",
          institutionId: "UEM",
          role: "CLIENTE",
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    };

    it("requests a paginated user list with same-origin credentials", async () => {
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
      vi.stubGlobal("fetch", fetch);

      await expect(listUsers(1, 20)).resolves.toEqual(page);
      expect(fetch).toHaveBeenCalledWith("/api/users?page=1&pageSize=20", {
        credentials: "same-origin",
      });
    });

    it("updates a profile and sends the selected role", async () => {
      const user = { ...page.data[0], role: "GESTOR" };
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { user } }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetch);

      await expect(changeUserRole("user-1", "GESTOR")).resolves.toEqual(user);
      expect(fetch).toHaveBeenCalledWith("/api/users/user-1/role", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ role: "GESTOR" }),
      });
    });

    it("preserves conflict details when a role change is rejected", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: "LAST_MANAGER_REQUIRED",
                message:
                  "A instituição precisa manter ao menos um Gestor ativo.",
              },
            }),
            { status: 409 },
          ),
        ),
      );

      await expect(
        changeUserRole("user-1", "MANUTENTOR"),
      ).rejects.toBeInstanceOf(UserManagementApiError);
    });
  });

  it("preserves validation errors from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: "VALIDATION_ERROR",
                message: "Dados de cadastro inválidos.",
              },
            }),
            { status: 422 },
          ),
        ),
    );

    await expect(registerUser(registration)).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
    });
  });

  it("preserves duplicate-email errors from the API", async () => {
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

    await expect(registerUser(registration)).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_ALREADY_EXISTS",
    });
  });

  it("creates a cookie session with the remember-me choice", async () => {
    const fetch = vi.fn().mockResolvedValue(
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
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      createSession("ana@example.edu", "password123", true),
    ).resolves.toMatchObject({ id: "user-1", role: "CLIENTE" });
    expect(fetch).toHaveBeenCalledWith("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email: "ana@example.edu",
        password: "password123",
        rememberMe: true,
      }),
    });
  });

  it("reads the current session and treats 401 as anonymous", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
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
      );
    vi.stubGlobal("fetch", fetch);

    await expect(getCurrentSession()).resolves.toBeNull();
    await expect(getCurrentSession()).resolves.toEqual({
      id: "user-1",
      fullName: "Ana Silva",
      email: "ana@example.edu",
      role: "CLIENTE",
    });
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/sessions/current", {
      credentials: "same-origin",
    });
  });

  it("ends the server session and surfaces unexpected session failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Ocorreu um erro interno.",
            },
          }),
          { status: 500 },
        ),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(deleteCurrentSession()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/sessions/current", {
      method: "DELETE",
      credentials: "same-origin",
    });
    await expect(deleteCurrentSession()).rejects.toBeInstanceOf(
      SessionApiError,
    );
  });
});
