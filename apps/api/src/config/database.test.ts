import { describe, expect, it } from "vitest";
import { createDataSource } from "./database.js";
import { Asset } from "../entities/Asset.js";
import { Solicitation } from "../entities/Solicitation.js";
import { StatusHistory } from "../entities/StatusHistory.js";
import { AuthSession } from "../entities/AuthSession.js";
import { User } from "../entities/User.js";
import { CreateAssets1793835564779 } from "../migrations/1793835564779-CreateAssets.js";
import { CreateAuthenticationTables1793847279000 } from "../migrations/1793847279000-CreateAuthenticationTables.js";
import { CreateSolicitations1793897712249 } from "../migrations/1793897712249-CreateSolicitations.js";
import { CreateStatusHistory1793969169334 } from "../migrations/1793969169334-CreateStatusHistory.js";
import { AddAssetToSolicitations1793972702308 } from "../migrations/1793972702308-AddAssetToSolicitations.js";
import { AddSolicitationListIndexes1793985000000 } from "../migrations/1793985000000-AddSolicitationListIndexes.js";
import { AddUserSpecialty1794050000000 } from "../migrations/1794050000000-AddUserSpecialty.js";

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

  it("registers the solicitation entity and its migration", () => {
    const dataSource = createDataSource("postgresql://localhost/fixit");

    expect(dataSource.options.entities).toContain(Solicitation);
    expect(dataSource.options.migrations).toContain(CreateSolicitations1793897712249);
  });

  it("registers the status history entity and its migration", () => {
    const dataSource = createDataSource("postgresql://localhost/fixit");

    expect(dataSource.options.entities).toContain(StatusHistory);
    expect(dataSource.options.migrations).toContain(CreateStatusHistory1793969169334);
  });

  it("registers the migration that links a solicitation to an asset", () => {
    const dataSource = createDataSource("postgresql://localhost/fixit");

    expect(dataSource.options.migrations).toContain(AddAssetToSolicitations1793972702308);
  });

  it("registers the solicitation list index migration", () => {
    const dataSource = createDataSource("postgresql://localhost/fixit");

    expect(dataSource.options.migrations).toContain(
      AddSolicitationListIndexes1793985000000,
    );
  });

  it("registers the user specialty migration", () => {
    const dataSource = createDataSource("postgresql://localhost/fixit");

    expect(dataSource.options.migrations).toContain(
      AddUserSpecialty1794050000000,
    );
  });

  it("registers the asset entity and its migration", () => {
    const dataSource = createDataSource("postgresql://localhost/fixit");

    expect(dataSource.options.entities).toContain(Asset);
    expect(dataSource.options.migrations).toContain(CreateAssets1793835564779);
  });
});
