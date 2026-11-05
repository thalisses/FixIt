import bcrypt from "bcrypt";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { User, UserRole } from "../entities/User.js";
import {
  createAuthenticationService,
  type AuthUserRepository,
} from "./authService.js";

const repository = {
  findOneBy: vi.fn<AuthUserRepository["findOneBy"]>(),
} satisfies AuthUserRepository;

const authenticationService = createAuthenticationService(repository);
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash("correct-password", 4);
});

function createUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: "user-1",
    fullName: "Ana Silva",
    email: "ana@example.edu",
    passwordHash,
    cpf: null,
    cityUf: null,
    institutionId: "UEM",
    role: UserRole.CLIENTE,
    isActive: true,
    ...overrides,
  });
}

describe("authentication service", () => {
  it("normalizes the email and authenticates an active user", async () => {
    repository.findOneBy.mockResolvedValue(createUser());

    await expect(
      authenticationService.authenticate(
        " ANA@EXAMPLE.EDU ",
        "correct-password",
      ),
    ).resolves.toMatchObject({ id: "user-1", role: UserRole.CLIENTE });
    expect(repository.findOneBy).toHaveBeenCalledWith({
      email: "ana@example.edu",
    });
  });

  it("rejects unknown, inactive, or incorrectly authenticated users", async () => {
    repository.findOneBy.mockResolvedValueOnce(null);
    await expect(
      authenticationService.authenticate("missing@example.edu", "wrong"),
    ).resolves.toBeNull();

    repository.findOneBy.mockResolvedValueOnce(
      createUser({ isActive: false }),
    );
    await expect(
      authenticationService.authenticate("ana@example.edu", "correct-password"),
    ).resolves.toBeNull();

    repository.findOneBy.mockResolvedValueOnce(createUser());
    await expect(
      authenticationService.authenticate("ana@example.edu", "wrong-password"),
    ).resolves.toBeNull();
  });
});
