import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique, type Relation,
} from "typeorm";
import { Solicitation } from "./Solicitation.js";
import { User } from "./User.js";

/** Só existe após confirmação na mesma transação dos metadados dos anexos. */
@Entity({ name: "attachment_upload_batches" })
@Unique("attachment_upload_batches_idempotency_unique", ["solicitacaoId", "autorId", "idempotencyKey"])
@Check("attachment_upload_batches_hash_check", `"payload_hash" ~ '^[0-9a-f]{64}$'`)
export class AttachmentUploadBatch {
  @PrimaryGeneratedColumn("uuid", { primaryKeyConstraintName: "attachment_upload_batches_pkey" })
  id!: string;

  @Column({ name: "idempotency_key", type: "uuid" })
  idempotencyKey!: string;

  @Column({ name: "solicitacao_id", type: "integer" })
  solicitacaoId!: number;

  @ManyToOne(() => Solicitation, { nullable: false, onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @JoinColumn({ name: "solicitacao_id", foreignKeyConstraintName: "attachment_upload_batches_solicitacao_fkey" })
  solicitacao!: Relation<Solicitation>;

  @Index("attachment_upload_batches_autor_idx")
  @Column({ name: "autor_id", type: "uuid" })
  autorId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @JoinColumn({ name: "autor_id", foreignKeyConstraintName: "attachment_upload_batches_autor_fkey" })
  autor!: Relation<User>;

  @Column({ name: "payload_hash", type: "text" })
  payloadHash!: string;

  @CreateDateColumn({ name: "criado_em", type: "timestamptz" })
  criadoEm!: Date;
}
