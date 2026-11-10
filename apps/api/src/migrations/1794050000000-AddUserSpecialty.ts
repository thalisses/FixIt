import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserSpecialty1794050000000 implements MigrationInterface {
  name = "AddUserSpecialty1794050000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_specialty_enum" AS ENUM (
        'ELETRICA',
        'HIDRAULICA',
        'INFORMATICA',
        'ESTRUTURAL',
        'OUTROS'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "specialty" "user_specialty_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "users_specialty_role_check"
      CHECK ("role" = 'MANUTENTOR' OR "specialty" IS NULL)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT "users_specialty_role_check"
    `);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "specialty"`);
    await queryRunner.query(`DROP TYPE "user_specialty_enum"`);
  }
}
