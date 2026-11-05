import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSession } from "../entities/AuthSession.js";
import { User, UserRole } from "../entities/User.js";
import {
  createSessionService,
  type SessionRepository,
} from "./sessionService.js";

const repository = {
  create: vi.fn<SessionRepository["create"]>(),
  save: vi.fn<SessionRepository["save"]>(),
  findOneByTokenHash: vi.fn<SessionRepository["findOneByTokenHash"]>(),
  findUserById: vi.fn<SessionRepository["findUserById"]>(),
} satisfies SessionRepository;

let currentTime: Date;
const sessionService = createSessionService(repository, () => currentTime);

function createUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: "user-1",
    fullName: "Ana Silva",
    email: "ana@example.edu",
    passwordHash: "private-hash",
    cpf: null,
    cityUf: null,
    institutionId: "UEM",
    role: UserRole.CLIENTE,
    isActive: true,
    ...overrides,
  });
}

function createSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return Object.assign(new AuthSession(), {
    id: "session-1",
    userId: "user-1",
    tokenHash: "",
    createdAt: currentTime,
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentTime = new Date("2026-03-01T00:00:00.000Z");
  repository.save.mockImplementation(async (session) => session);
});

describe("session service", () => {
  it("stores only a token hash and applies the seven-day remember-me expiry", async () => {
    repository.create.mockImplementation((session) =>
      Object.assign(new AuthSession(), session),
    );
    const user = createUser();

    const created = await sessionService.create(user, true);
    const stored = repository.create.mock.calls[0]?.[0];

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored?.tokenHash).toBe(
      createHash("sha256").update(created.token).digest("hex"),
    );
    expect(stored?.tokenHash).not.toContain(created.token);
    expect(created.expiresAt?.getTime()).toBe(
      currentTime.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    expect(stored?.revokedAt).toBeNull();
    expect(created.user).toEqual({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    });
    expect(created.user).not.toHaveProperty("passwordHash");
    expect(repository.save).toHaveBeenCalledOnce();
  });

  it("creates browser sessions without a persistent expiry", async () => {
    repository.create.mockImplementation((session) =>
      Object.assign(new AuthSession(), session),
    );

    const created = await sessionService.create(createUser(), false);

    expect(created.expiresAt).toBeNull();
    expect(repository.create.mock.calls[0]?.[0].expiresAt).toBeNull();
  });

  it("loads the current role from the user record and rejects invalid sessions", async () => {
    const token = "A".repeat(43);
    repository.findOneByTokenHash.mockResolvedValue(createSession());
    repository.findUserById.mockResolvedValue(
      createUser({ role: UserRole.GESTOR }),
    );

    await expect(sessionService.getCurrent(token)).resolves.toEqual({
      id: "user-1",
      fullName: "Ana Silva",
      email: "ana@example.edu",
      role: UserRole.GESTOR,
    });

    await expect(sessionService.getCurrent("invalid")).resolves.toBeNull();
    expect(repository.findOneByTokenHash).toHaveBeenCalledOnce();
  });

  it("rejects revoked, expired, and inactive-user sessions", async () => {
    const token = "B".repeat(43);
    repository.findOneByTokenHash.mockResolvedValueOnce(
      createSession({ revokedAt: currentTime }),
    );
    await expect(sessionService.getCurrent(token)).resolves.toBeNull();

    repository.findOneByTokenHash.mockResolvedValueOnce(
      createSession({ expiresAt: new Date(currentTime.getTime() - 1) }),
    );
    await expect(sessionService.getCurrent(token)).resolves.toBeNull();

    repository.findOneByTokenHash.mockResolvedValueOnce(createSession());
    repository.findUserById.mockResolvedValueOnce(createUser({ isActive: false }));
    await expect(sessionService.getCurrent(token)).resolves.toBeNull();
  });

  it("revokes a valid session", async () => {
    const token = "C".repeat(43);
    repository.findOneByTokenHash.mockResolvedValue(createSession());
    repository.findUserById.mockResolvedValue(createUser());

    await expect(sessionService.revoke(token)).resolves.toBe(true);

    const revoked = vi.mocked(repository.save).mock.calls[0]?.[0];
    expect(revoked?.revokedAt).toEqual(currentTime);
  });
});
