import { describe, expect, it } from "vitest";
import { Asset } from "../entities/Asset.js";
import { CreateAssets1793835564779 } from "../migrations/1793835564779-CreateAssets.js";
import { createDataSource } from "./database.js";

describe("createDataSource", () => {
  const { options } = createDataSource(
    "postgresql://user:password@localhost:5432/test",
  );

  it("changes the schema only through migrations", () => {
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(true);
  });

  it("registers the asset entity and its migration", () => {
    expect(options.entities).toContain(Asset);
    expect(options.migrations).toContain(CreateAssets1793835564779);
  });
});
