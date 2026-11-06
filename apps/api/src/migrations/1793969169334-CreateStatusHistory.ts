import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateStatusHistory1793969169334 implements MigrationInterface {
    name = 'CreateStatusHistory1793969169334'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tipo_registro" AS ENUM('ABERTURA', 'MUDANCA_STATUS', 'ATRIBUICAO', 'OBSERVACAO', 'CANCELAMENTO')`);
        await queryRunner.query(`CREATE TABLE "status_history" ("id" SERIAL NOT NULL, "tipo" "public"."tipo_registro" NOT NULL, "status_anterior" "public"."status_solicitacao", "status_novo" "public"."status_solicitacao", "descricao" text, "data_hora" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "solicitacao_id" integer NOT NULL, "autor_id" uuid NOT NULL, CONSTRAINT "PK_271a5228edb4eeb41bc01d58fac" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "status_history" ADD CONSTRAINT "FK_0c664222769b47720a844367a1c" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "status_history" ADD CONSTRAINT "FK_98d90fb65b6c96a4cd453fb8477" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "status_history" DROP CONSTRAINT "FK_98d90fb65b6c96a4cd453fb8477"`);
        await queryRunner.query(`ALTER TABLE "status_history" DROP CONSTRAINT "FK_0c664222769b47720a844367a1c"`);
        await queryRunner.query(`DROP TABLE "status_history"`);
        await queryRunner.query(`DROP TYPE "public"."tipo_registro"`);
    }

}
