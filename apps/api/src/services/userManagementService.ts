import { User, UserRole } from "../entities/User.js";
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
  data: PublicUser[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface UserManagementService {
  list(page: number, pageSize: number): Promise<ManagedUserPage>;
  changeRole(
    userId: string,
    role: UserRole,
    actorId: string,
  ): Promise<PublicUser>;
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

export function createUserManagementService(
  repository: UserManagementRepository,
): UserManagementService {
  return {
    async list(page, pageSize) {
      const { users, totalItems } = await repository.list(page, pageSize);
      return {
        data: users.map(toPublicUser),
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      };
    },

    async changeRole(userId, role, actorId) {
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

        if (user.role === role) {
          return toPublicUser(user);
        }
        if (!isAllowedTransition(user.role, role)) {
          throw new RoleTransitionError();
        }
        if (
          user.role === UserRole.GESTOR &&
          role !== UserRole.GESTOR &&
          activeManagers.length <= 1
        ) {
          throw new LastActiveManagerError();
        }

        user.role = role;
        return toPublicUser(await transaction.save(user));
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

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    institutionId: user.institutionId,
    role: user.role,
  };
}
