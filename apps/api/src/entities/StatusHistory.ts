import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";
import { Solicitation, StatusSolicitacao } from "./Solicitation.js";
import { User } from "./User.js";

export enum TipoRegistro {
  ABERTURA = "ABERTURA",
  MUDANCA_STATUS = "MUDANCA_STATUS",
  ATRIBUICAO = "ATRIBUICAO",
  OBSERVACAO = "OBSERVACAO",
  CANCELAMENTO = "CANCELAMENTO",
}

@Entity({ name: "status_history" })
export class StatusHistory {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "enum", enum: TipoRegistro, enumName: "tipo_registro" })
  tipo!: TipoRegistro;

  @Column({
    name: "status_anterior",
    type: "enum",
    enum: StatusSolicitacao,
    enumName: "status_solicitacao",
    nullable: true,
  })
  statusAnterior!: StatusSolicitacao | null;

  @Column({
    name: "status_novo",
    type: "enum",
    enum: StatusSolicitacao,
    enumName: "status_solicitacao",
    nullable: true,
  })
  statusNovo!: StatusSolicitacao | null;

  @Column({ type: "text", nullable: true })
  descricao!: string | null;

  @CreateDateColumn({ name: "data_hora", type: "timestamptz" })
  dataHora!: Date;

  @Column({ name: "solicitacao_id", type: "integer" })
  solicitacaoId!: number;

  @ManyToOne(() => Solicitation, { nullable: false })
  @JoinColumn({ name: "solicitacao_id" })
  solicitacao!: Relation<Solicitation>;

  @Column({ name: "autor_id", type: "uuid" })
  autorId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "autor_id" })
  autor!: Relation<User>;
}
