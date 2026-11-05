import type { RequestHandler } from "express";
import type {
  PublicSessionUser,
  SessionService,
} from "../services/sessionService.js";
import { readSessionCookie } from "./sessionCookie.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicSessionUser;
    }
  }
}

export function createRequireAuth(
  sessionService: SessionService,
): RequestHandler {
  return (request, response, next) => {
    const token = readSessionCookie(request);
    if (!token) {
      sendUnauthenticated(response);
      return;
    }

    void sessionService.getCurrent(token).then(
      (user) => {
        if (!user) {
          sendUnauthenticated(response);
          return;
        }

        request.authUser = user;
        next();
      },
      next,
    );
  };
}

function sendUnauthenticated(response: Parameters<RequestHandler>[1]): void {
  response.status(401).json({
    error: {
      code: "UNAUTHENTICATED",
      message: "Autenticação necessária.",
    },
  });
}
