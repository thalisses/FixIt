import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { DatabaseHealthCheck } from "./healthRoutes.js";

let server: Server | undefined;

afterEach(async () => {
  const currentServer = server;
  server = undefined;

  if (!currentServer?.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    currentServer.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

async function startServer(checkDatabase: DatabaseHealthCheck): Promise<string> {
  server = createApp(checkDatabase).listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

describe("health routes", () => {
  it("reports that the process is live without checking the database", async () => {
    const checkDatabase = vi.fn<DatabaseHealthCheck>();
    const baseUrl = await startServer(checkDatabase);

    const response = await fetch(`${baseUrl}/health/live`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it("reports ready when the database check succeeds", async () => {
    const checkDatabase = vi.fn<DatabaseHealthCheck>().mockResolvedValue();
    const baseUrl = await startServer(checkDatabase);

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it("returns a generic unavailable response when the database check fails", async () => {
    const checkDatabase = vi
      .fn<DatabaseHealthCheck>()
      .mockRejectedValue(new Error("private connection details"));
    const baseUrl = await startServer(checkDatabase);

    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain('"database":"unavailable"');
    expect(body).not.toContain("private connection details");
  });
});