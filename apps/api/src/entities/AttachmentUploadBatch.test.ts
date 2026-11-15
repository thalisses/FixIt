import type { EntityMetadata, QueryRunner } from "typeorm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createDataSource } from "../config/database.js";
import { CreateAttachmentUploadBatches1794700000000 } from "../migrations/1794700000000-CreateAttachmentUploadBatches.js";
import { AttachmentUploadBatch } from "./AttachmentUploadBatch.js";
import { SolicitationAttachment } from "./SolicitationAttachment.js";

let batch: EntityMetadata;
let attachment: EntityMetadata;
beforeAll(async () => {
  const source = createDataSource("postgresql://localhost/fixit_test");
  await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  batch = source.getMetadata(AttachmentUploadBatch);
  attachment = source.getMetadata(SolicitationAttachment);
});

describe("batch persistence and additive migration (without PostgreSQL)", () => {
  it("scopes idempotency uniqueness by request, author and key", () => {
    expect(batch.uniques.map((unique) => unique.columns.map((column) => column.propertyName)))
      .toEqual([["solicitacaoId", "autorId", "idempotencyKey"]]);
    expect(batch.columns.every((column) => !column.isNullable)).toBe(true);
    expect(batch.columns.map((column) => column.propertyName)).toEqual([
      "id", "idempotencyKey", "solicitacaoId", "autorId", "payloadHash", "criadoEm",
    ]);
    expect(batch.primaryColumns[0]).toMatchObject({ type: "uuid", isGenerated: true });
  });
  it("preserves author and solicitation references and nullable linkage for legacy attachments", () => {
    expect(batch.foreignKeys.map((key) => key.referencedTablePath).sort()).toEqual(["solicitations", "users"]);
    expect(batch.foreignKeys.every((key) => key.onDelete === "NO ACTION")).toBe(true);
    const relation = attachment.relations.find((entry) => entry.propertyName === "uploadBatch")!;
    expect(relation.isNullable).toBe(true);
    expect(relation.inverseEntityMetadata.target).toBe(AttachmentUploadBatch);
    expect(relation.isCascadeRemove).toBe(false);
  });
  it("creates a new table and adds nullable linkage without rewriting existing attachment rows", async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new CreateAttachmentUploadBatches1794700000000().up({ query } as unknown as QueryRunner);
    const statements = query.mock.calls.map(([sql]) => sql.replace(/\s+/g, " ").trim());
    const sql = statements[0];
    for (const column of batch.columns) expect(sql).toContain(`"${column.databaseName}" ${column.type} NOT NULL`);
    for (const check of batch.checks) expect(sql).toContain(`CONSTRAINT "${check.name}" CHECK (${check.expression})`);
    expect(sql).toContain('UNIQUE ("solicitacao_id", "autor_id", "idempotency_key")');
    for (const key of batch.foreignKeys) expect(sql).toContain(`CONSTRAINT "${key.name}" FOREIGN KEY ("${key.columns[0].databaseName}") REFERENCES "${key.referencedTablePath}"("id")`);
    expect(statements).toContain('ALTER TABLE "solicitation_attachments" ADD "upload_batch_id" uuid');
    expect(statements.some((statement) => /^(UPDATE|DELETE|TRUNCATE|DROP)\b/.test(statement))).toBe(false);
  });
  it("reverts the new linkage before removing the batch table", async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new CreateAttachmentUploadBatches1794700000000().down({ query } as unknown as QueryRunner);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'ALTER TABLE "solicitation_attachments" DROP CONSTRAINT "solicitation_attachments_upload_batch_fkey"',
      'DROP INDEX "solicitation_attachments_upload_batch_idx"',
      'ALTER TABLE "solicitation_attachments" DROP COLUMN "upload_batch_id"',
      'DROP TABLE "attachment_upload_batches"',
    ]);
  });
});
