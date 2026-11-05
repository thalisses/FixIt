import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAssets1793835564779 implements MigrationInterface {
    name = 'CreateAssets1793835564779'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."estado_conservacao" AS ENUM('NOVO', 'BOM', 'REGULAR', 'RUIM', 'INSERVIVEL')`);
        await queryRunner.query(`CREATE TABLE "assets" ("id" SERIAL NOT NULL, "codigo_patrimonial" text NOT NULL, "descricao" text NOT NULL, "localizacao" text NOT NULL, "estado_conservacao" "public"."estado_conservacao" NOT NULL, "data_aquisicao" date, "garantia" date, CONSTRAINT "UQ_e012dfac4440d82ab98ef27ab04" UNIQUE ("codigo_patrimonial"), CONSTRAINT "PK_da96729a8b113377cfb6a62439c" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "assets"`);
        await queryRunner.query(`DROP TYPE "public"."estado_conservacao"`);
    }

}
