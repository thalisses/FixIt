import type { EntityMetadata, QueryRunner } from "typeorm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createDataSource } from "../config/database.js";
import { CreateSolicitationAttachments1794690000000 } from "../migrations/1794690000000-CreateSolicitationAttachments.js";
import { Solicitation } from "./Solicitation.js";
import { SolicitationAttachment } from "./SolicitationAttachment.js";
import { User } from "./User.js";
import { CreateAttachmentUploadBatches1794700000000 } from "../migrations/1794700000000-CreateAttachmentUploadBatches.js";

let metadata: EntityMetadata;
beforeAll(async () => {
  const dataSource = createDataSource("postgresql://localhost/fixit_test");
  await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  metadata = dataSource.getMetadata(SolicitationAttachment);
});

describe("SolicitationAttachment persistence structure (without a database connection)", () => {
  it("stores exactly the specified metadata with generated UUID and timestamp", () => {
    expect(metadata.tableName).toBe("solicitation_attachments");
    expect(metadata.columns.map((column) => column.databaseName)).toEqual([
      "id", "solicitacao_id", "autor_id", "nome_original", "mime_type",
      "tamanho_bytes", "storage_key", "criado_em", "upload_batch_id",
    ]);
    expect(metadata.columns.filter((column) => column.isNullable).map((column) => column.propertyName)).toEqual(["uploadBatchId"]);
    expect(metadata.primaryColumns).toHaveLength(1);
    expect(metadata.primaryColumns[0]).toMatchObject({
      propertyName: "id", type: "uuid", isGenerated: true, generationStrategy: "uuid",
    });
    expect(metadata.columns.find((column) => column.propertyName === "criadoEm"))
      .toMatchObject({ type: "timestamptz", isCreateDate: true });
    expect(metadata.columns.find((column) => column.propertyName === "tamanhoBytes")?.type).toBe("integer");
  });

  it("requires existing solicitation and author without cascade deletion", () => {
    expect(metadata.foreignKeys).toHaveLength(3);
    for (const [property, target, type] of [
      ["solicitacao", Solicitation, "integer"], ["autor", User, "uuid"],
    ] as const) {
      const relation = metadata.relations.find((entry) => entry.propertyName === property)!;
      expect(relation.isNullable).toBe(false);
      expect(relation.isCascadeInsert).toBe(false);
      expect(relation.isCascadeRemove).toBe(false);
      expect(relation.inverseEntityMetadata.target).toBe(target);
      expect(relation.joinColumns[0]).toMatchObject({ type, referencedColumn: { propertyName: "id" } });
      expect(relation.foreignKeys[0]).toMatchObject({ onDelete: "NO ACTION", onUpdate: "NO ACTION" });
    }
  });

  it("indexes both foreign keys and keeps storage keys unique", () => {
    expect(metadata.indices.map((index) => index.columns.map((column) => column.propertyName)))
      .toEqual(expect.arrayContaining([["solicitacaoId"], ["autorId"]]));
    expect(metadata.uniques.map((unique) => unique.columns.map((column) => column.propertyName)))
      .toEqual([["storageKey"]]);
  });

  it("keeps migration columns, checks, foreign keys and indexes aligned with entity metadata", async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    const runner = { query } as unknown as QueryRunner;
    await new CreateSolicitationAttachments1794690000000().up(runner);
    await new CreateAttachmentUploadBatches1794700000000().up(runner);
    const statements = query.mock.calls.map(([sql]) => sql.replace(/\s+/g, " ").trim());
    const tableSql = statements[0];
    for (const column of metadata.columns) {
      if (column.propertyName === "uploadBatchId") {
        expect(statements).toContain('ALTER TABLE "solicitation_attachments" ADD "upload_batch_id" uuid');
        continue;
      }
      expect(tableSql).toContain(`"${column.databaseName}" ${column.type} NOT NULL`);
    }
    for (const check of metadata.checks) {
      expect(tableSql).toContain(`CONSTRAINT "${check.name}" CHECK (${check.expression})`);
    }
    for (const key of metadata.foreignKeys) {
      if (key.columns[0].propertyName === "uploadBatchId") {
        expect(statements.join(" ")).toContain(`CONSTRAINT "${key.name}" FOREIGN KEY ("upload_batch_id") REFERENCES "attachment_upload_batches"("id")`);
        continue;
      }
      expect(tableSql).toContain(`CONSTRAINT "${key.name}" FOREIGN KEY ("${key.columns[0].databaseName}") REFERENCES "${key.referencedTablePath}"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }
    expect(tableSql).toContain('DEFAULT gen_random_uuid()');
    expect(tableSql).toContain('"criado_em" timestamptz NOT NULL DEFAULT now()');
    expect(tableSql).toContain('UNIQUE ("storage_key")');
    for (const index of metadata.indices) {
      expect(statements).toContain(`CREATE INDEX "${index.name}" ON "solicitation_attachments" ("${index.columns[0].databaseName}")`);
    }
    expect(statements).toHaveLength(8);
  });

  it("reverts only the attachment table", async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new CreateSolicitationAttachments1794690000000().down({ query } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledExactlyOnceWith('DROP TABLE "solicitation_attachments"');
  });
});
