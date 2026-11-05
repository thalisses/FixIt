import type { Request, RequestHandler, Response } from "express";

export function createCsrfMiddleware(webOrigin: string): RequestHandler {
  return (request, response, next) => {
    if (assertAllowedOrigin(request, response, webOrigin)) {
      next();
    }
  };
}

export function assertAllowedOrigin(
  request: Request,
  response: Response,
  webOrigin: string,
): boolean {
  if (request.get("Origin") === webOrigin) {
    return true;
  }

  response.status(403).json({
    error: {
      code: "ORIGIN_NOT_ALLOWED",
      message: "Origem da requisição não permitida.",
    },
  });
  return false;
}
