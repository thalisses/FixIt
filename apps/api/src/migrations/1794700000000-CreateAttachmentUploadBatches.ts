import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAttachmentUploadBatches1794700000000 implements MigrationInterface {
  name = "CreateAttachmentUploadBatches1794700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attachment_upload_batches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "idempotency_key" uuid NOT NULL,
        "solicitacao_id" integer NOT NULL,
        "autor_id" uuid NOT NULL,
        "payload_hash" text NOT NULL,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "attachment_upload_batches_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "attachment_upload_batches_idempotency_unique"
          UNIQUE ("solicitacao_id", "autor_id", "idempotency_key"),
        CONSTRAINT "attachment_upload_batches_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "attachment_upload_batches_solicitacao_fkey"
          FOREIGN KEY ("solicitacao_id") REFERENCES "solicitations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "attachment_upload_batches_autor_fkey"
          FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "attachment_upload_batches_autor_idx" ON "attachment_upload_batches" ("autor_id")`);
    await queryRunner.query(`ALTER TABLE "solicitation_attachments" ADD "upload_batch_id" uuid`);
    await queryRunner.query(`ALTER TABLE "solicitation_attachments" ADD CONSTRAINT "solicitation_attachments_upload_batch_fkey" FOREIGN KEY ("upload_batch_id") REFERENCES "attachment_upload_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`CREATE INDEX "solicitation_attachments_upload_batch_idx" ON "solicitation_attachments" ("upload_batch_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "solicitation_attachments" DROP CONSTRAINT "solicitation_attachments_upload_batch_fkey"`);
    await queryRunner.query(`DROP INDEX "solicitation_attachments_upload_batch_idx"`);
    await queryRunner.query(`ALTER TABLE "solicitation_attachments" DROP COLUMN "upload_batch_id"`);
    await queryRunner.query(`DROP TABLE "attachment_upload_batches"`);
  }
}
