import bcrypt from "bcrypt";
import { describe, expect, it, vi } from "vitest";
import { User, UserRole } from "../entities/User.js";
import {
  createProvisionManagerService,
  ExistingManagerError,
  ProvisioningAccountNotFoundError,
  type ProvisionManagerRepository,
} from "./provisionManagerService.js";

function createUser(role = UserRole.CLIENTE): User {
  const user = new User();
  Object.assign(user, {
    id: "user-1",
    fullName: "Ana Silva",
    email: "ana@example.edu",
    passwordHash: "old-hash",
    cpf: null,
    cityUf: null,
    institutionId: "UEM",
    role,
    isActive: true,
  });
  return user;
}

function createRepository(user: User | null, hasManager = false) {
  const manager = hasManager ? createUser(UserRole.GESTOR) : null;
  const repository: ProvisionManagerRepository = {
    transaction: (work) =>
      work({
        findActiveManager: async () => manager,
        findByEmailForUpdate: async () => user,
        save: async (account) => account,
      }),
  };
  return repository;
}

describe("first Gestor provisioning", () => {
  it("promotes an existing account and replaces its password with a bcrypt hash", async () => {
    const user = createUser();
    const service = createProvisionManagerService(createRepository(user));

    await expect(
      service.provision(" ANA@EXAMPLE.EDU ", "InitialPass123!"),
    ).resolves.toEqual({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: UserRole.GESTOR,
    });
    expect(user.role).toBe(UserRole.GESTOR);
    expect(user.passwordHash).not.toBe("InitialPass123!");
    await expect(bcrypt.compare("InitialPass123!", user.passwordHash)).resolves
      .toBe(true);
  });

  it("refuses provisioning when an active Gestor already exists", async () => {
    const service = createProvisionManagerService(
      createRepository(createUser(), true),
    );

    await expect(
      service.provision("ana@example.edu", "InitialPass123!"),
    ).rejects.toBeInstanceOf(ExistingManagerError);
  });

  it("refuses an e-mail without an existing account", async () => {
    const service = createProvisionManagerService(createRepository(null));

    await expect(
      service.provision("missing@example.edu", "InitialPass123!"),
    ).rejects.toBeInstanceOf(ProvisioningAccountNotFoundError);
  });

  it("does not hash invalid input", async () => {
    const hashPassword = vi.fn(async () => "unused");
    const service = createProvisionManagerService(
      createRepository(createUser()),
      hashPassword,
    );

    await expect(
      service.provision("invalid-email", "short"),
    ).rejects.toThrow("A valid e-mail");
    expect(hashPassword).not.toHaveBeenCalled();
  });
});
