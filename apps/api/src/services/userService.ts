import bcrypt from "bcrypt";
import { User, UserRole } from "../entities/User.js";
import type { InstitutionId } from "../config/institutions.js";

const passwordSaltRounds = 12;

export interface RegisterUserInput {
  fullName: string;
  email: string;
  password: string;
  institutionId: InstitutionId;
  cpf?: string;
  cityUf?: string;
}

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  institutionId: string;
  role: UserRole;
}

export interface NewUser {
  fullName: string;
  email: string;
  passwordHash: string;
  cpf: string | null;
  cityUf: string | null;
  institutionId: InstitutionId;
  role: UserRole;
  specialty: null;
  isActive: boolean;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("A user with this email already exists.");
    this.name = "DuplicateEmailError";
  }
}

export class InvalidPasswordError extends Error {
  constructor() {
    super("Password must contain 8 to 72 UTF-8 bytes.");
    this.name = "InvalidPasswordError";
  }
}

export interface UserRepository {
  create(user: NewUser): User;
  findOneBy(where: { email: string }): Promise<User | null>;
  save(user: User): Promise<User>;
}

export interface UserRegistrationService {
  register(input: RegisterUserInput): Promise<PublicUser>;
}

export function createUserService(
  repository: UserRepository,
): UserRegistrationService {
  return {
    async register(input) {
      if (
        Array.from(input.password).length < 8 ||
        Buffer.byteLength(input.password, "utf8") > 72
      ) {
        throw new InvalidPasswordError();
      }

      const email = input.email.trim().toLowerCase();
      const existingUser = await repository.findOneBy({ email });
      if (existingUser) {
        throw new DuplicateEmailError();
      }

      const user = repository.create({
        fullName: input.fullName.trim(),
        email,
        passwordHash: await bcrypt.hash(input.password, passwordSaltRounds),
        cpf: input.cpf?.trim() || null,
        cityUf: input.cityUf?.trim() || null,
        institutionId: input.institutionId,
        role: UserRole.CLIENTE,
        specialty: null,
        isActive: true,
      });

      try {
        const savedUser = await repository.save(user);
        return {
          id: savedUser.id,
          fullName: savedUser.fullName,
          email: savedUser.email,
          institutionId: savedUser.institutionId,
          role: savedUser.role,
        };
      } catch (error) {
        if (isEmailUniqueViolation(error)) {
          throw new DuplicateEmailError();
        }

        throw error;
      }
    },
  };
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("driverError" in error)) {
    return false;
  }

  const { driverError } = error;
  if (typeof driverError !== "object" || driverError === null) {
    return false;
  }

  return (
    "code" in driverError &&
    driverError.code === "23505" &&
    "constraint" in driverError &&
    driverError.constraint === "users_email_lower_unique_idx"
  );
}
