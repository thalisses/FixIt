import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export enum EstadoConservacao {
  NOVO = "NOVO",
  BOM = "BOM",
  REGULAR = "REGULAR",
  RUIM = "RUIM",
  INSERVIVEL = "INSERVIVEL",
}

@Entity({ name: "assets" })
export class Asset {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ name: "codigo_patrimonial", type: "text", unique: true })
  codigoPatrimonial!: string;

  @Column({ type: "text" })
  descricao!: string;

  @Column({ type: "text" })
  localizacao!: string;

  @Column({
    name: "estado_conservacao",
    type: "enum",
    enum: EstadoConservacao,
    enumName: "estado_conservacao",
  })
  estadoConservacao!: EstadoConservacao;

  @Column({ name: "data_aquisicao", type: "date", nullable: true })
  dataAquisicao!: string | null;

  @Column({ type: "date", nullable: true })
  garantia!: string | null;
}
