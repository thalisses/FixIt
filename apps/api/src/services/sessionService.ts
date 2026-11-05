import { createHash, randomBytes } from "node:crypto";
import { AuthSession } from "../entities/AuthSession.js";
import { User, type UserRole } from "../entities/User.js";

const rememberMeDurationMs = 7 * 24 * 60 * 60 * 1000;
const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export interface PublicSessionUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface CreatedSession {
  token: string;
  expiresAt: Date | null;
  user: PublicSessionUser;
}

export interface SessionRepository {
  create(
    session: Pick<
      AuthSession,
      "userId" | "tokenHash" | "expiresAt" | "revokedAt"
    >,
  ): AuthSession;
  save(session: AuthSession): Promise<AuthSession>;
  findOneByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  findUserById(userId: string): Promise<User | null>;
}

export interface SessionService {
  create(user: User, rememberMe: boolean): Promise<CreatedSession>;
  getCurrent(token: string): Promise<PublicSessionUser | null>;
  revoke(token: string): Promise<boolean>;
}

export function createSessionService(
  repository: SessionRepository,
  now: () => Date = () => new Date(),
): SessionService {
  async function getActiveSession(token: string) {
    if (!sessionTokenPattern.test(token)) {
      return null;
    }

    const session = await repository.findOneByTokenHash(hashToken(token));
    if (
      !session ||
      session.revokedAt !== null ||
      (session.expiresAt !== null && session.expiresAt.getTime() <= now().getTime())
    ) {
      return null;
    }

    const user = await repository.findUserById(session.userId);
    return user?.isActive ? { session, user } : null;
  }

  return {
    async create(user, rememberMe) {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = rememberMe
        ? new Date(now().getTime() + rememberMeDurationMs)
        : null;
      const session = repository.create({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        revokedAt: null,
      });

      await repository.save(session);

      return {
        token,
        expiresAt,
        user: toPublicSessionUser(user),
      };
    },

    async getCurrent(token) {
      const activeSession = await getActiveSession(token);
      return activeSession ? toPublicSessionUser(activeSession.user) : null;
    },

    async revoke(token) {
      const activeSession = await getActiveSession(token);
      if (!activeSession) {
        return false;
      }

      activeSession.session.revokedAt = now();
      await repository.save(activeSession.session);
      return true;
    },
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toPublicSessionUser(user: User): PublicSessionUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
}
