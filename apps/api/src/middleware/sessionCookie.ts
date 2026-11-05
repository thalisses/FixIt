import type { Request } from "express";

export const sessionCookieName = "fixit_session";

export function readSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookiePrefix = `${sessionCookieName}=`;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookiePrefix));

  return cookie?.slice(cookiePrefix.length) || null;
}
