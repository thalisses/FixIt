import { once } from "node:events";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createCsrfMiddleware } from "./csrf.js";

let server: Server | undefined;

afterEach(async () => {
  const currentServer = server;
  server = undefined;

  if (currentServer?.listening) {
    await new Promise<void>((resolve, reject) => {
      currentServer.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
});

async function startServer(): Promise<string> {
  const app = express();
  app.delete(
    "/protected",
    createCsrfMiddleware("https://fixit.example.edu"),
    (_request, response) => response.status(204).end(),
  );
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("CSRF origin validation", () => {
  it("allows the configured origin", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/protected`, {
      method: "DELETE",
      headers: { origin: "https://fixit.example.edu" },
    });

    expect(response.status).toBe(204);
  });

  it.each([undefined, "https://attacker.example", "null"])(
    "rejects a missing or untrusted origin (%s)",
    async (origin) => {
      const baseUrl = await startServer();
      const response = await fetch(`${baseUrl}/protected`, {
        method: "DELETE",
        headers: origin ? { origin } : {},
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "Origem da requisição não permitida.",
        },
      });
    },
  );
});
