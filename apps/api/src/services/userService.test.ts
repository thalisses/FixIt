import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { User, UserRole } from "../entities/User.js";
import {
  createUserService,
  DuplicateEmailError,
  InvalidPasswordError,
  type NewUser,
  type UserRepository,
} from "./userService.js";

const repository = {
  create: vi.fn((user: NewUser) => Object.assign(new User(), user)),
  findOneBy: vi.fn<UserRepository["findOneBy"]>(),
  save: vi.fn<UserRepository["save"]>(),
} satisfies UserRepository;

const userService = createUserService(repository);

beforeEach(() => {
  vi.clearAllMocks();
  repository.findOneBy.mockResolvedValue(null);
  repository.save.mockImplementation(async (user) =>
    Object.assign(user, { id: "user-1" }),
  );
});

describe("user service", () => {
  it("normalizes the email and stores only a bcrypt hash for an active Cliente", async () => {
    const user = await userService.register({
      fullName: "  Ana Silva ",
      email: "  ANA@EXAMPLE.EDU ",
      password: "password123",
      institutionId: "UEM",
    });

    const saved = repository.save.mock.calls[0]?.[0];
    expect(repository.findOneBy).toHaveBeenCalledWith({ email: "ana@example.edu" });
    expect(saved).toMatchObject({
      fullName: "Ana Silva",
      email: "ana@example.edu",
      cpf: null,
      cityUf: null,
      institutionId: "UEM",
      role: UserRole.CLIENTE,
      isActive: true,
    });
    expect(saved?.passwordHash).not.toBe("password123");
    expect(await bcrypt.compare("password123", saved?.passwordHash ?? "")).toBe(true);
    expect(user).toEqual({
      id: "user-1",
      fullName: "Ana Silva",
      email: "ana@example.edu",
      institutionId: "UEM",
      role: UserRole.CLIENTE,
    });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rejects an email that already exists without saving a user", async () => {
    repository.findOneBy.mockResolvedValueOnce(new User());

    await expect(
      userService.register({
        fullName: "Ana Silva",
        email: "ana@example.edu",
        password: "password123",
        institutionId: "UEM",
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("rejects passwords that exceed bcrypt's UTF-8 byte limit", async () => {
    await expect(
      userService.register({
        fullName: "Ana Silva",
        email: "ana@example.edu",
        password: "a".repeat(73),
        institutionId: "UEM",
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordError);
    expect(repository.findOneBy).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("maps a concurrent email uniqueness conflict and rethrows other database errors", async () => {
    repository.save.mockRejectedValueOnce({
      driverError: { code: "23505", constraint: "users_email_lower_unique_idx" },
    });

    await expect(
      userService.register({
        fullName: "Ana Silva",
        email: "ana@example.edu",
        password: "password123",
        institutionId: "UEM",
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);

    const databaseError = new Error("database unavailable");
    repository.save.mockRejectedValueOnce(databaseError);
    await expect(
      userService.register({
        fullName: "Ana Silva",
        email: "another@example.edu",
        password: "password123",
        institutionId: "UEM",
      }),
    ).rejects.toBe(databaseError);
  });
});
