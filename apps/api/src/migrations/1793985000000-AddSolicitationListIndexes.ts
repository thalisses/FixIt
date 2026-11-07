import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSolicitationListIndexes1793985000000
  implements MigrationInterface
{
  name = "AddSolicitationListIndexes1793985000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "solicitations_status_idx" ON "solicitations" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "solicitations_data_idx" ON "solicitations" ("data")`,
    );
    await queryRunner.query(
      `CREATE INDEX "solicitations_prioridade_idx" ON "solicitations" ("prioridade")`,
    );
    await queryRunner.query(
      `CREATE INDEX "solicitations_tipo_problema_idx" ON "solicitations" ("tipo_problema")`,
    );
    await queryRunner.query(
      `CREATE INDEX "solicitations_setor_responsavel_idx" ON "solicitations" ("setor_responsavel")`,
    );
    await queryRunner.query(
      `CREATE INDEX "solicitations_solicitante_id_idx" ON "solicitations" ("solicitante_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "solicitations_responsavel_id_idx" ON "solicitations" ("responsavel_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."solicitations_responsavel_id_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."solicitations_solicitante_id_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."solicitations_setor_responsavel_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."solicitations_tipo_problema_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."solicitations_prioridade_idx"`,
    );
    await queryRunner.query(`DROP INDEX "public"."solicitations_data_idx"`);
    await queryRunner.query(`DROP INDEX "public"."solicitations_status_idx"`);
  }
}
