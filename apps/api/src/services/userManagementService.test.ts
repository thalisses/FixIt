import { describe, expect, it } from "vitest";
import { User, UserRole, UserSpecialty } from "../entities/User.js";
import {
  createUserManagementService,
  LastActiveManagerError,
  ManagedUserNotFoundError,
  ManagerAuthorizationError,
  RoleTransitionError,
  SpecialtyRequiredError,
  type UserManagementRepository,
} from "./userManagementService.js";

function createUser(id: string, role: UserRole): User {
  const user = new User();
  Object.assign(user, {
    id,
    fullName: `${id} Name`,
    email: `${id}@example.edu`,
    passwordHash: "private-hash",
    cpf: null,
    cityUf: null,
    institutionId: "UEM",
    role,
    specialty: null,
    isActive: true,
  });
  return user;
}

function createRepository(users: User[]): UserManagementRepository {
  return {
    list: async (page, pageSize) => ({
      users: users.slice((page - 1) * pageSize, page * pageSize),
      totalItems: users.length,
    }),
    transaction: (work) =>
      work({
        lockRoleChanges: async () => {},
        getActiveManagers: async () =>
          users.filter(
            (user) => user.isActive && user.role === UserRole.GESTOR,
          ),
        findByIdForUpdate: async (userId) =>
          users.find((user) => user.id === userId) ?? null,
        save: async (user) => user,
      }),
  };
}

describe("user management service", () => {
  it("returns paginated users without credentials", async () => {
    const users = [
      createUser("client-1", UserRole.CLIENTE),
      createUser("manager-1", UserRole.GESTOR),
    ];
    const service = createUserManagementService(createRepository(users));

    await expect(service.list(2, 1)).resolves.toEqual({
      data: [
        {
          id: "manager-1",
          fullName: "manager-1 Name",
          email: "manager-1@example.edu",
          institutionId: "UEM",
          role: UserRole.GESTOR,
          specialty: null,
        },
      ],
      pagination: {
        page: 2,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2,
      },
    });
  });

  it.each([
    [UserRole.CLIENTE, UserRole.MANUTENTOR],
    [UserRole.CLIENTE, UserRole.GESTOR],
    [UserRole.MANUTENTOR, UserRole.GESTOR],
    [UserRole.GESTOR, UserRole.MANUTENTOR],
  ])("allows the transition %s -> %s", async (currentRole, nextRole) => {
    const manager = createUser("manager-1", UserRole.GESTOR);
    const target = createUser("target-1", currentRole);
    const service = createUserManagementService(
      createRepository([manager, target]),
    );
    const specialty =
      nextRole === UserRole.MANUTENTOR
        ? UserSpecialty.INFORMATICA
        : undefined;

    await expect(
      service.changeRole(target.id, nextRole, manager.id, specialty),
    ).resolves.toMatchObject({
      id: target.id,
      role: nextRole,
      specialty: specialty ?? null,
    });
  });

  it("prevents a change that would remove the last active Gestor", async () => {
    const manager = createUser("manager-1", UserRole.GESTOR);
    const service = createUserManagementService(
      createRepository([manager]),
    );

    await expect(
      service.changeRole(
        manager.id,
        UserRole.MANUTENTOR,
        manager.id,
        UserSpecialty.OUTROS,
      ),
    ).rejects.toBeInstanceOf(LastActiveManagerError);
  });

  it("requires a specialty to promote or complete a Manutentor profile", async () => {
    const manager = createUser("manager-1", UserRole.GESTOR);
    const client = createUser("client-1", UserRole.CLIENTE);
    const pendingMaintainer = createUser("maintainer-1", UserRole.MANUTENTOR);
    const service = createUserManagementService(
      createRepository([manager, client, pendingMaintainer]),
    );

    await expect(
      service.changeRole(client.id, UserRole.MANUTENTOR, manager.id),
    ).rejects.toBeInstanceOf(SpecialtyRequiredError);
    await expect(
      service.changeRole(
        pendingMaintainer.id,
        UserRole.MANUTENTOR,
        manager.id,
      ),
    ).rejects.toBeInstanceOf(SpecialtyRequiredError);
    await expect(
      service.changeRole(
        pendingMaintainer.id,
        UserRole.MANUTENTOR,
        manager.id,
        UserSpecialty.ESTRUTURAL,
      ),
    ).resolves.toMatchObject({
      role: UserRole.MANUTENTOR,
      specialty: UserSpecialty.ESTRUTURAL,
    });
  });

  it("clears the specialty when a Manutentor changes to Gestor", async () => {
    const manager = createUser("manager-1", UserRole.GESTOR);
    const maintainer = createUser("maintainer-1", UserRole.MANUTENTOR);
    maintainer.specialty = UserSpecialty.ELETRICA;
    const service = createUserManagementService(
      createRepository([manager, maintainer]),
    );

    await expect(
      service.changeRole(maintainer.id, UserRole.GESTOR, manager.id),
    ).resolves.toMatchObject({
      role: UserRole.GESTOR,
      specialty: null,
    });
  });

  it("rejects unsupported transitions and non-manager actors", async () => {
    const manager = createUser("manager-1", UserRole.GESTOR);
    const client = createUser("client-1", UserRole.CLIENTE);
    const maintainer = createUser("maintainer-1", UserRole.MANUTENTOR);
    const service = createUserManagementService(
      createRepository([manager, client, maintainer]),
    );

    await expect(
      service.changeRole(maintainer.id, UserRole.CLIENTE, manager.id),
    ).rejects.toBeInstanceOf(RoleTransitionError);
    await expect(
      service.changeRole(client.id, UserRole.GESTOR, client.id),
    ).rejects.toBeInstanceOf(ManagerAuthorizationError);
    await expect(
      service.changeRole("missing", UserRole.GESTOR, manager.id),
    ).rejects.toBeInstanceOf(ManagedUserNotFoundError);
  });
});
