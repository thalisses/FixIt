import { User, UserRole, UserSpecialty } from "../entities/User.js";
import type { PublicUser } from "./userService.js";

export interface UserManagementRepository {
  list(
    page: number,
    pageSize: number,
  ): Promise<{ users: User[]; totalItems: number }>;
  transaction<T>(
    work: (transaction: UserManagementTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface UserManagementTransaction {
  lockRoleChanges(): Promise<void>;
  getActiveManagers(): Promise<User[]>;
  findByIdForUpdate(userId: string): Promise<User | null>;
  save(user: User): Promise<User>;
}

export interface ManagedUserPage {
  data: ManagedPublicUser[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ManagedPublicUser extends PublicUser {
  specialty: UserSpecialty | null;
}

export interface UserManagementService {
  list(page: number, pageSize: number): Promise<ManagedUserPage>;
  changeRole(
    userId: string,
    role: UserRole,
    actorId: string,
    specialty?: UserSpecialty,
  ): Promise<ManagedPublicUser>;
}

export class ManagedUserNotFoundError extends Error {
  constructor() {
    super("User not found.");
    this.name = "ManagedUserNotFoundError";
  }
}

export class ManagerAuthorizationError extends Error {
  constructor() {
    super("An active Gestor is required.");
    this.name = "ManagerAuthorizationError";
  }
}

export class RoleTransitionError extends Error {
  constructor() {
    super("The requested role transition is not allowed.");
    this.name = "RoleTransitionError";
  }
}

export class LastActiveManagerError extends Error {
  constructor() {
    super("The institution must retain an active Gestor.");
    this.name = "LastActiveManagerError";
  }
}

export class SpecialtyRequiredError extends Error {
  constructor() {
    super("A specialty is required for a Manutentor.");
    this.name = "SpecialtyRequiredError";
  }
}

export function createUserManagementService(
  repository: UserManagementRepository,
): UserManagementService {
  return {
    async list(page, pageSize) {
      const { users, totalItems } = await repository.list(page, pageSize);
      return {
        data: users.map(toManagedUser),
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      };
    },

    async changeRole(userId, role, actorId, specialty) {
      return repository.transaction(async (transaction) => {
        await transaction.lockRoleChanges();
        const activeManagers = await transaction.getActiveManagers();
        const actor = await transaction.findByIdForUpdate(actorId);
        if (!actor?.isActive || actor.role !== UserRole.GESTOR) {
          throw new ManagerAuthorizationError();
        }

        const user = await transaction.findByIdForUpdate(userId);
        if (!user) {
          throw new ManagedUserNotFoundError();
        }

        const roleChanged = user.role !== role;
        if (
          role === UserRole.MANUTENTOR &&
          specialty === undefined &&
          (roleChanged || user.specialty === null)
        ) {
          throw new SpecialtyRequiredError();
        }
        if (roleChanged && !isAllowedTransition(user.role, role)) {
          throw new RoleTransitionError();
        }
        if (
          roleChanged &&
          user.role === UserRole.GESTOR &&
          role !== UserRole.GESTOR &&
          activeManagers.length <= 1
        ) {
          throw new LastActiveManagerError();
        }

        const specialtyChanged =
          role === UserRole.MANUTENTOR
            ? specialty !== undefined && specialty !== user.specialty
            : user.specialty !== null;
        if (!roleChanged && !specialtyChanged) {
          return toManagedUser(user);
        }

        user.role = role;
        user.specialty =
          role === UserRole.MANUTENTOR ? specialty ?? user.specialty : null;
        return toManagedUser(await transaction.save(user));
      });
    },
  };
}

function isAllowedTransition(current: UserRole, next: UserRole): boolean {
  if (current === UserRole.CLIENTE) {
    return next === UserRole.MANUTENTOR || next === UserRole.GESTOR;
  }

  if (current === UserRole.MANUTENTOR) {
    return next === UserRole.GESTOR;
  }

  return current === UserRole.GESTOR && next === UserRole.MANUTENTOR;
}

function toManagedUser(user: User): ManagedPublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    institutionId: user.institutionId,
    role: user.role,
    specialty: user.specialty ?? null,
  };
}
