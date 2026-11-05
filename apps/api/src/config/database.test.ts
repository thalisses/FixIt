import { describe, expect, it } from "vitest";
import { createDataSource } from "./database.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User } from "../entities/User.js";
import { CreateAuthenticationTables1793847279000 } from "../migrations/1793847279000-CreateAuthenticationTables.js";

describe("createDataSource", () => {
  it("registers authentication entities and migration without schema synchronization", () => {
    const dataSource = createDataSource("postgresql://localhost/fixit");

    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.entities).toEqual(
      expect.arrayContaining([User, AuthSession]),
    );
    expect(dataSource.options.migrations).toContain(
      CreateAuthenticationTables1793847279000,
    );
  });
});
