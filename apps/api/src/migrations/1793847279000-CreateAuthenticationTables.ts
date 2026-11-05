import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthenticationTables1793847279000
  implements MigrationInterface
{
  name = "CreateAuthenticationTables1793847279000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM (
        'CLIENTE',
        'MANUTENTOR',
        'GESTOR'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "full_name" varchar(160) NOT NULL,
        "email" varchar(320) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "cpf" varchar(14),
        "city_uf" varchar(120),
        "institution_id" varchar(64) NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'CLIENTE',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "users_full_name_nonempty" CHECK (length(trim("full_name")) > 0),
        CONSTRAINT "users_email_nonempty" CHECK (length(trim("email")) > 0),
        CONSTRAINT "users_institution_id_nonempty" CHECK (length(trim("institution_id")) > 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "users_email_lower_unique_idx"
      ON "users" (lower(trim("email")))
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" char(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expires_at" timestamptz,
        "revoked_at" timestamptz,
        CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "auth_sessions_user_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "auth_sessions_token_hash_unique_idx"
      ON "auth_sessions" ("token_hash")
    `);

    await queryRunner.query(`
      CREATE INDEX "auth_sessions_user_expiry_idx"
      ON "auth_sessions" ("user_id", "expires_at")
      WHERE "revoked_at" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
