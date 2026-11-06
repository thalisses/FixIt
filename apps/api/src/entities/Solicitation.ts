import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";
import { Asset } from "./Asset.js";
import { User } from "./User.js";

export enum AreaTecnica {
  ELETRICA = "ELETRICA",
  HIDRAULICA = "HIDRAULICA",
  INFORMATICA = "INFORMATICA",
  ESTRUTURAL = "ESTRUTURAL",
  OUTROS = "OUTROS",
}

export enum NivelUrgencia {
  BAIXA = "BAIXA",
  MEDIA = "MEDIA",
  ALTA = "ALTA",
}

export enum NivelPrioridade {
  BAIXA = "BAIXA",
  MEDIA = "MEDIA",
  ALTA = "ALTA",
}

export enum StatusSolicitacao {
  EM_ABERTO = "EM_ABERTO",
  EM_ATENDIMENTO = "EM_ATENDIMENTO",
  CONCLUIDO = "CONCLUIDO",
  CANCELADA = "CANCELADA",
}

@Entity({ name: "solicitations" })
export class Solicitation {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @CreateDateColumn({ type: "timestamptz" })
  data!: Date;

  @Column({ type: "text" })
  local!: string;

  @Column({
    name: "tipo_problema",
    type: "enum",
    enum: AreaTecnica,
    enumName: "area_tecnica",
  })
  tipoProblema!: AreaTecnica;

  @Column({ name: "setor_responsavel", type: "text", nullable: true })
  setorResponsavel!: string | null;

  @Column({ name: "descricao_problema", type: "text" })
  descricaoProblema!: string;

  @Column({ type: "text", nullable: true })
  observacoes!: string | null;

  @Column({ type: "enum", enum: NivelUrgencia, enumName: "nivel_urgencia" })
  urgencia!: NivelUrgencia;

  @Column({
    type: "enum",
    enum: NivelPrioridade,
    enumName: "nivel_prioridade",
    nullable: true,
  })
  prioridade!: NivelPrioridade | null;

  @Column({
    type: "enum",
    enum: StatusSolicitacao,
    enumName: "status_solicitacao",
    default: StatusSolicitacao.EM_ABERTO,
  })
  status!: StatusSolicitacao;

  @Column({ name: "data_conclusao", type: "timestamptz", nullable: true })
  dataConclusao!: Date | null;

  @Column({ name: "solicitante_id", type: "uuid" })
  solicitanteId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "solicitante_id" })
  solicitante!: Relation<User>;

  @Column({ name: "responsavel_id", type: "uuid", nullable: true })
  responsavelId!: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: "responsavel_id" })
  responsavel!: Relation<User> | null;

  // Opcional: problemas como uma infiltração não se referem a um bem (US008).
  @Index("solicitations_bem_id_idx")
  @Column({ name: "bem_id", type: "integer", nullable: true })
  bemId!: number | null;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: "bem_id" })
  bem!: Relation<Asset> | null;
}
