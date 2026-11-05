import type { RequestHandler } from "express";

const allowedMethods = "GET, POST, PATCH, DELETE, OPTIONS";
const allowedHeaders = "Content-Type";

export function createCorsMiddleware(webOrigin: string): RequestHandler {
  return (request, response, next) => {
    response.vary("Origin");
    const origin = request.get("Origin");

    if (origin === webOrigin) {
      response.setHeader("Access-Control-Allow-Origin", webOrigin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
    }

    if (request.method !== "OPTIONS") {
      next();
      return;
    }

    if (origin !== webOrigin) {
      response.status(403).json({
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "Origem da requisição não permitida.",
        },
      });
      return;
    }

    const requestedMethod = request.get("Access-Control-Request-Method");
    if (requestedMethod && !allowedMethods.split(", ").includes(requestedMethod)) {
      response.status(403).json({
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "Método da requisição não permitido.",
        },
      });
      return;
    }

    response.setHeader("Access-Control-Allow-Methods", allowedMethods);
    response.setHeader("Access-Control-Allow-Headers", allowedHeaders);
    response.status(204).end();
  };
}
