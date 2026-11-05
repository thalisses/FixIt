export interface AppEnvironment {
  port: number;
  databaseUrl: string;
  webOrigin: string;
  isProduction: boolean;
}

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): AppEnvironment {
  const port = Number(source.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }

  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  let protocol: string;
  try {
    protocol = new URL(databaseUrl).protocol;
  } catch {
    throw new Error("DATABASE_URL must be a valid URL.");
  }

  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
  }

  const isProduction = source.NODE_ENV === "production";
  const webOrigin = loadWebOrigin(source.WEB_ORIGIN, isProduction);

  return { port, databaseUrl, webOrigin, isProduction };
}

function loadWebOrigin(value: string | undefined, isProduction: boolean): string {
  const webOrigin = value?.trim() || (isProduction ? "" : "http://localhost:5173");
  if (!webOrigin) {
    throw new Error("WEB_ORIGIN is required in production.");
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(webOrigin);
  } catch {
    throw new Error("WEB_ORIGIN must be a valid origin URL.");
  }

  if (
    (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") ||
    parsedOrigin.origin !== webOrigin
  ) {
    throw new Error("WEB_ORIGIN must contain only an origin, without a path.");
  }
  if (isProduction && parsedOrigin.protocol !== "https:") {
    throw new Error("WEB_ORIGIN must use HTTPS in production.");
  }

  return webOrigin;
}