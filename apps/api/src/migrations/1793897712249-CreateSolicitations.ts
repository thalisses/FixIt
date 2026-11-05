import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSolicitations1793897712249 implements MigrationInterface {
    name = 'CreateSolicitations1793897712249'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."area_tecnica" AS ENUM('ELETRICA', 'HIDRAULICA', 'INFORMATICA', 'ESTRUTURAL', 'OUTROS')`);
        await queryRunner.query(`CREATE TYPE "public"."nivel_urgencia" AS ENUM('BAIXA', 'MEDIA', 'ALTA')`);
        await queryRunner.query(`CREATE TYPE "public"."nivel_prioridade" AS ENUM('BAIXA', 'MEDIA', 'ALTA')`);
        await queryRunner.query(`CREATE TYPE "public"."status_solicitacao" AS ENUM('EM_ABERTO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'CANCELADA')`);
        await queryRunner.query(`CREATE TABLE "solicitations" ("id" SERIAL NOT NULL, "data" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "local" text NOT NULL, "tipo_problema" "public"."area_tecnica" NOT NULL, "setor_responsavel" text, "descricao_problema" text NOT NULL, "observacoes" text, "urgencia" "public"."nivel_urgencia" NOT NULL, "prioridade" "public"."nivel_prioridade", "status" "public"."status_solicitacao" NOT NULL DEFAULT 'EM_ABERTO', "data_conclusao" TIMESTAMP WITH TIME ZONE, "solicitante_id" uuid NOT NULL, "responsavel_id" uuid, CONSTRAINT "PK_53503efa9bcfa87b80700677e88" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_872755c31ea521eb1fa7305e6e4" FOREIGN KEY ("solicitante_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_664db730a532e80d74dad1167f1" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_664db730a532e80d74dad1167f1"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_872755c31ea521eb1fa7305e6e4"`);
        await queryRunner.query(`DROP TABLE "solicitations"`);
        await queryRunner.query(`DROP TYPE "public"."status_solicitacao"`);
        await queryRunner.query(`DROP TYPE "public"."nivel_prioridade"`);
        await queryRunner.query(`DROP TYPE "public"."nivel_urgencia"`);
        await queryRunner.query(`DROP TYPE "public"."area_tecnica"`);
    }

}
