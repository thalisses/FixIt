import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssetToSolicitations1793972702308 implements MigrationInterface {
    name = 'AddAssetToSolicitations1793972702308'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "bem_id" integer`);
        await queryRunner.query(`CREATE INDEX "solicitations_bem_id_idx" ON "solicitations" ("bem_id") `);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_51f1273c383645c80ebbd61f178" FOREIGN KEY ("bem_id") REFERENCES "assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_51f1273c383645c80ebbd61f178"`);
        await queryRunner.query(`DROP INDEX "public"."solicitations_bem_id_idx"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "bem_id"`);
    }

}
