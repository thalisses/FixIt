import bcrypt from "bcrypt";
import type { User } from "../entities/User.js";

export interface AuthUserRepository {
  findOneBy(where: { email: string }): Promise<User | null>;
}

export interface AuthenticationService {
  authenticate(email: string, password: string): Promise<User | null>;
}

export function createAuthenticationService(
  repository: AuthUserRepository,
): AuthenticationService {
  return {
    async authenticate(email, password) {
      if (Buffer.byteLength(password, "utf8") > 72) {
        return null;
      }

      const user = await repository.findOneBy({
        email: email.trim().toLowerCase(),
      });
      if (!user || !user.isActive) {
        return null;
      }

      return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
    },
  };
}
