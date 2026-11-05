import type { RequestHandler } from "express";
import { UserRole } from "../entities/User.js";

export function createRequireRole(...roles: UserRole[]): RequestHandler {
  return (request, response, next) => {
    const user = request.authUser;
    if (!user) {
      response.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Autenticação necessária.",
        },
      });
      return;
    }

    if (!roles.includes(user.role)) {
      response.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Você não tem permissão para esta ação.",
        },
      });
      return;
    }

    next();
  };
}
