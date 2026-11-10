import bcrypt from "bcrypt";
import { User, UserRole } from "../entities/User.js";

const passwordSaltRounds = 12;

export interface ProvisionManagerTransaction {
  findActiveManager(): Promise<User | null>;
  findByEmailForUpdate(email: string): Promise<User | null>;
  save(user: User): Promise<User>;
}

export interface ProvisionManagerRepository {
  transaction<T>(
    work: (transaction: ProvisionManagerTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface ProvisionedManager {
  id: string;
  fullName: string;
  email: string;
  role: UserRole.GESTOR;
}

export class ExistingManagerError extends Error {
  constructor() {
    super("An active Gestor already exists.");
    this.name = "ExistingManagerError";
  }
}

export class ProvisioningAccountNotFoundError extends Error {
  constructor() {
    super("No account exists for the supplied e-mail.");
    this.name = "ProvisioningAccountNotFoundError";
  }
}

export class ProvisioningAccountInactiveError extends Error {
  constructor() {
    super("The account must be active to become Gestor.");
    this.name = "ProvisioningAccountInactiveError";
  }
}

export class InvalidProvisioningInputError extends Error {
  constructor() {
    super("A valid e-mail and an 8-to-72-byte password are required.");
    this.name = "InvalidProvisioningInputError";
  }
}

export function createProvisionManagerService(
  repository: ProvisionManagerRepository,
  hashPassword: (password: string) => Promise<string> = (password) =>
    bcrypt.hash(password, passwordSaltRounds),
) {
  return {
    async provision(
      emailInput: string,
      password: string,
    ): Promise<ProvisionedManager> {
      const email = emailInput.trim().toLowerCase();
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 320 ||
        Array.from(password).length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
      ) {
        throw new InvalidProvisioningInputError();
      }

      const passwordHash = await hashPassword(password);
      return repository.transaction(async (transaction) => {
        if (await transaction.findActiveManager()) {
          throw new ExistingManagerError();
        }

        const user = await transaction.findByEmailForUpdate(email);
        if (!user) {
          throw new ProvisioningAccountNotFoundError();
        }
        if (!user.isActive) {
          throw new ProvisioningAccountInactiveError();
        }

        user.role = UserRole.GESTOR;
        user.specialty = null;
        user.passwordHash = passwordHash;
        const savedUser = await transaction.save(user);
        return {
          id: savedUser.id,
          fullName: savedUser.fullName,
          email: savedUser.email,
          role: UserRole.GESTOR,
        };
      });
    },
  };
}
