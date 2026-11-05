export interface RegisterUserInput {
  fullName: string;
  email: string;
  password: string;
  institutionId: "UEM";
  cpf?: string;
  cityUf?: string;
}

export interface RegisteredUser {
  id: string;
  fullName: string;
  email: string;
  institutionId: string;
  role: "CLIENTE" | "MANUTENTOR" | "GESTOR";
}

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: "CLIENTE" | "MANUTENTOR" | "GESTOR";
}

export interface ManagedUser extends SessionUser {
  institutionId: string;
}

export interface ManagedUserPage {
  data: ManagedUser[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class RegistrationApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RegistrationApiError";
  }
}

export class SessionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SessionApiError";
  }
}

export class UserManagementApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UserManagementApiError";
  }
}

export async function registerUser(
  input: RegisterUserInput,
): Promise<RegisteredUser> {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = readApiError(body);
    throw new RegistrationApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Não foi possível concluir o cadastro. Tente novamente.",
    );
  }

  const user = readRegisteredUser(body);
  if (!user) {
    throw new RegistrationApiError(
      response.status,
      "INVALID_RESPONSE",
      "A resposta do servidor não confirmou o cadastro.",
    );
  }

  return user;
}

export async function createSession(
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<SessionUser> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, password, rememberMe }),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = readApiError(body);
    throw new SessionApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Não foi possível iniciar a sessão.",
    );
  }

  const user = readSessionUser(body);
  if (!user) {
    throw new SessionApiError(
      response.status,
      "INVALID_RESPONSE",
      "A resposta do servidor não confirmou o login.",
    );
  }

  return user;
}

export async function getCurrentSession(): Promise<SessionUser | null> {
  const response = await fetch("/api/sessions/current", {
    credentials: "same-origin",
  });
  if (response.status === 401) {
    return null;
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readApiError(body);
    throw new SessionApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Não foi possível verificar a sessão.",
    );
  }

  const user = readSessionUser(body);
  if (!user) {
    throw new SessionApiError(
      response.status,
      "INVALID_RESPONSE",
      "A resposta do servidor não contém uma sessão válida.",
    );
  }

  return user;
}

export async function deleteCurrentSession(): Promise<void> {
  const response = await fetch("/api/sessions/current", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (response.status === 204 || response.status === 401) {
    return;
  }

  const body: unknown = await response.json().catch(() => null);
  const error = readApiError(body);
  throw new SessionApiError(
    response.status,
    error?.code ?? "REQUEST_FAILED",
    error?.message ?? "Não foi possível encerrar a sessão.",
  );
}

export async function listUsers(
  page: number,
  pageSize: number,
): Promise<ManagedUserPage> {
  const response = await fetch(
    `/api/users?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`,
    { credentials: "same-origin" },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readApiError(body);
    throw new UserManagementApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Não foi possível carregar os usuários.",
    );
  }

  const result = readManagedUserPage(body);
  if (!result) {
    throw new UserManagementApiError(
      response.status,
      "INVALID_RESPONSE",
      "A resposta do servidor não contém uma lista de usuários válida.",
    );
  }

  return result;
}

export async function changeUserRole(
  userId: string,
  role: SessionUser["role"],
): Promise<ManagedUser> {
  const response = await fetch(
    `/api/users/${encodeURIComponent(userId)}/role`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ role }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readApiError(body);
    throw new UserManagementApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Não foi possível alterar o perfil.",
    );
  }

  const user =
    isRecord(body) && isRecord(body.data)
      ? readManagedUser(body.data.user)
      : null;
  if (!user) {
    throw new UserManagementApiError(
      response.status,
      "INVALID_RESPONSE",
      "A resposta do servidor não confirmou a alteração de perfil.",
    );
  }

  return user;
}

function readApiError(
  value: unknown,
): { code: string; message: string } | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null;
  }

  const { code, message } = value.error;
  return typeof code === "string" && typeof message === "string"
    ? { code, message }
    : null;
}

function readRegisteredUser(value: unknown): RegisteredUser | null {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.user)) {
    return null;
  }

  const user = value.data.user;
  if (
    typeof user.id !== "string" ||
    typeof user.fullName !== "string" ||
    typeof user.email !== "string" ||
    typeof user.institutionId !== "string" ||
    (user.role !== "CLIENTE" &&
      user.role !== "MANUTENTOR" &&
      user.role !== "GESTOR")
  ) {
    return null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    institutionId: user.institutionId,
    role: user.role,
  };
}

function readSessionUser(value: unknown): SessionUser | null {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.user)) {
    return null;
  }

  return parseSessionUser(value.data.user);
}

function parseSessionUser(value: unknown): SessionUser | null {
  if (!isRecord(value)) {
    return null;
  }

  const user = value;
  if (
    typeof user.id !== "string" ||
    typeof user.fullName !== "string" ||
    typeof user.email !== "string" ||
    (user.role !== "CLIENTE" &&
      user.role !== "MANUTENTOR" &&
      user.role !== "GESTOR")
  ) {
    return null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
}

function readManagedUserPage(value: unknown): ManagedUserPage | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !isRecord(value.pagination)
  ) {
    return null;
  }

  const users: ManagedUser[] = [];
  for (const entry of value.data) {
    const user = readManagedUser(entry);
    if (!user) {
      return null;
    }
    users.push(user);
  }
  const { page, pageSize, totalItems, totalPages } = value.pagination;
  if (
    !isNonnegativeInteger(page) ||
    page < 1 ||
    !isNonnegativeInteger(pageSize) ||
    pageSize < 1 ||
    !isNonnegativeInteger(totalItems) ||
    !isNonnegativeInteger(totalPages)
  ) {
    return null;
  }

  return {
    data: users,
    pagination: { page, pageSize, totalItems, totalPages },
  };
}

function readManagedUser(value: unknown): ManagedUser | null {
  const user = parseSessionUser(value);
  if (!user || !isRecord(value) || typeof value.institutionId !== "string") {
    return null;
  }
  return { ...user, institutionId: value.institutionId };
}

function isNonnegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
