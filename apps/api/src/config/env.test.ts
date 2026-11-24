import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadEnvironment } from "./env.js";

const baseEnvironment = {
  DATABASE_URL: "postgresql://fixit:local-only@localhost:5432/fixit",
};

describe("application environment", () => {
  it("accepts an absolute upload directory", () => {
    const uploadDir = resolve("custom-uploads");
    expect(loadEnvironment({ ...baseEnvironment, UPLOAD_DIR: uploadDir }).uploadDir).toBe(uploadDir);
  });

  it.each(["", "   ", "relative/uploads", "bad\0path"])("rejects invalid UPLOAD_DIR %s", (uploadDir) => {
    expect(() => loadEnvironment({ ...baseEnvironment, UPLOAD_DIR: uploadDir }))
      .toThrow("UPLOAD_DIR must be a nonempty absolute path.");
  });

  it("requires an explicit upload directory in production", () => {
    expect(() => loadEnvironment({
      ...baseEnvironment,
      NODE_ENV: "production",
      WEB_ORIGIN: "https://fixit.example.edu",
      ATTACHMENTS_ENABLED: "true",
    }))
      .toThrow("UPLOAD_DIR is required in production when attachments are enabled.");
  });

  it("disables attachments by default in production without requiring a storage directory", () => {
    const environment = loadEnvironment({
      ...baseEnvironment,
      NODE_ENV: "production",
      WEB_ORIGIN: "https://fixit.example.edu",
    });

    expect(environment.attachmentsEnabled).toBe(false);
    expect(environment.uploadDir).toBe(resolve("uploads"));
  });

  it("rejects an invalid attachment setting", () => {
    expect(() =>
      loadEnvironment({
        ...baseEnvironment,
        ATTACHMENTS_ENABLED: "sometimes",
      }),
    ).toThrow("ATTACHMENTS_ENABLED must be 'true' or 'false'.");
  });

  it("uses the local web origin by default outside production", () => {
    expect(loadEnvironment(baseEnvironment)).toEqual({
      port: 3000,
      databaseUrl: baseEnvironment.DATABASE_URL,
      webOrigin: "http://localhost:5173",
      isProduction: false,
      attachmentsEnabled: true,
      uploadDir: resolve("uploads"),
    });
  });

  it("requires a valid HTTPS web origin in production", () => {
    expect(() =>
      loadEnvironment({ ...baseEnvironment, NODE_ENV: "production" }),
    ).toThrow("WEB_ORIGIN is required in production.");
    expect(() =>
      loadEnvironment({
        ...baseEnvironment,
        NODE_ENV: "production",
        WEB_ORIGIN: "http://fixit.example.edu",
      }),
    ).toThrow("WEB_ORIGIN must use HTTPS in production.");
  });

  it("uses Render's public service URL as the production origin by default", () => {
    const environment = loadEnvironment({
      ...baseEnvironment,
      NODE_ENV: "production",
      RENDER_EXTERNAL_URL: "https://fixit-pilot.onrender.com",
    });

    expect(environment.webOrigin).toBe("https://fixit-pilot.onrender.com");
  });

  it("rejects values that are not a single origin", () => {
    expect(() =>
      loadEnvironment({
        ...baseEnvironment,
        WEB_ORIGIN: "http://localhost:5173/login",
      }),
    ).toThrow("WEB_ORIGIN must contain only an origin, without a path.");
  });
});
