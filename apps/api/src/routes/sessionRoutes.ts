import { Router, type Response } from "express";
import type { AuthenticationService } from "../services/authService.js";
import type { CreatedSession, SessionService } from "../services/sessionService.js";
import { assertAllowedOrigin } from "../middleware/csrf.js";
import { readSessionCookie, sessionCookieName } from "../middleware/sessionCookie.js";

const maxSessionAgeSeconds = 7 * 24 * 60 * 60;

export interface SessionRouteOptions {
  secureCookies: boolean;
  webOrigin: string;
}

export function createSessionRoutes(
  authenticationService: AuthenticationService,
  sessionService: SessionService,
  options: SessionRouteOptions,
): Router {
  const router = Router();

  router.post("/api/sessions", (request, response, next) => {
    const credentials = parseLoginInput(request.body);
    if (!credentials) {
      response.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados de login inválidos.",
        },
      });
      return;
    }

    void authenticateAndCreateSession(
      credentials,
      authenticationService,
      sessionService,
      response,
      options,
    ).catch(next);
  });

  router.get("/api/sessions/current", (request, response, next) => {
    const token = readSessionCookie(request);
    if (!token) {
      sendInvalidSession(response);
      return;
    }

    void sessionService.getCurrent(token).then(
      (user) => {
        if (!user) {
          sendInvalidSession(response);
          return;
        }
        response.status(200).json({ data: { user } });
      },
      next,
    );
  });

  router.delete("/api/sessions/current", (request, response, next) => {
    const token = readSessionCookie(request);
    if (!token) {
      sendInvalidSession(response);
      return;
    }

    void sessionService.getCurrent(token).then(
      (user) => {
        if (!user) {
          sendInvalidSession(response);
          return;
        }
        if (!assertAllowedOrigin(request, response, options.webOrigin)) {
          return;
        }

        void sessionService.revoke(token).then(
          (revoked) => {
            if (!revoked) {
              sendInvalidSession(response);
              return;
            }
            response.setHeader("Set-Cookie", createClearedCookie(options));
            response.status(204).end();
          },
          next,
        );
      },
      next,
    );
  });

  return router;
}

async function authenticateAndCreateSession(
  credentials: LoginInput,
  authenticationService: AuthenticationService,
  sessionService: SessionService,
  response: Response,
  options: SessionRouteOptions,
): Promise<void> {
  const user = await authenticationService.authenticate(
    credentials.email,
    credentials.password,
  );
  if (!user) {
    response.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "E-mail ou senha inválidos.",
      },
    });
    return;
  }

  const session = await sessionService.create(user, credentials.rememberMe);
  response.setHeader("Set-Cookie", createSessionCookie(session, options));
  response.status(201).json({ data: { user: session.user } });
}

interface LoginInput {
  email: string;
  password: string;
  rememberMe: boolean;
}

function parseLoginInput(value: unknown): LoginInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const { email, password, rememberMe } = value;
  if (
    typeof email !== "string" ||
    email.trim().length === 0 ||
    email.trim().length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length === 0 ||
    (rememberMe !== undefined && typeof rememberMe !== "boolean")
  ) {
    return null;
  }

  return {
    email,
    password,
    rememberMe: rememberMe === true,
  };
}

function createSessionCookie(
  session: CreatedSession,
  options: SessionRouteOptions,
): string {
  const attributes = [
    `${sessionCookieName}=${session.token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (session.expiresAt) {
    attributes.push(`Max-Age=${maxSessionAgeSeconds}`);
    attributes.push(`Expires=${session.expiresAt.toUTCString()}`);
  }
  if (options.secureCookies) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function createClearedCookie(options: SessionRouteOptions): string {
  return [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ...(options.secureCookies ? ["Secure"] : []),
  ].join("; ");
}

function sendInvalidSession(response: Response): void {
  response.status(401).json({
    error: {
      code: "UNAUTHENTICATED",
      message: "Autenticação necessária.",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
