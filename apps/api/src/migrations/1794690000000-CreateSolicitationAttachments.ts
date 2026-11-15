import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSolicitationAttachments1794690000000 implements MigrationInterface {
  name = "CreateSolicitationAttachments1794690000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "solicitation_attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "solicitacao_id" integer NOT NULL,
        "autor_id" uuid NOT NULL,
        "nome_original" text NOT NULL,
        "mime_type" text NOT NULL,
        "tamanho_bytes" integer NOT NULL,
        "storage_key" text NOT NULL,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "solicitation_attachments_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "solicitation_attachments_storage_key_unique" UNIQUE ("storage_key"),
        CONSTRAINT "solicitation_attachments_size_check"
          CHECK ("tamanho_bytes" > 0 AND "tamanho_bytes" <= 5000000),
        CONSTRAINT "solicitation_attachments_mime_check"
          CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'image/webp')),
        CONSTRAINT "solicitation_attachments_solicitacao_fkey"
          FOREIGN KEY ("solicitacao_id") REFERENCES "solicitations"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "solicitation_attachments_autor_fkey"
          FOREIGN KEY ("autor_id") REFERENCES "users"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "solicitation_attachments_solicitacao_id_idx"
      ON "solicitation_attachments" ("solicitacao_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "solicitation_attachments_autor_id_idx"
      ON "solicitation_attachments" ("autor_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "solicitation_attachments"`);
  }
}
