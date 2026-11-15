import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from "typeorm";
import { Solicitation } from "./Solicitation.js";
import { User } from "./User.js";
import { AttachmentUploadBatch } from "./AttachmentUploadBatch.js";

@Entity({ name: "solicitation_attachments" })
@Unique("solicitation_attachments_storage_key_unique", ["storageKey"])
@Check(
  "solicitation_attachments_size_check",
  `"tamanho_bytes" > 0 AND "tamanho_bytes" <= 5000000`,
)
@Check(
  "solicitation_attachments_mime_check",
  `"mime_type" IN ('image/jpeg', 'image/png', 'image/webp')`,
)
export class SolicitationAttachment {
  @PrimaryGeneratedColumn("uuid", { primaryKeyConstraintName: "solicitation_attachments_pkey" })
  id!: string;

  @Index("solicitation_attachments_solicitacao_id_idx")
  @Column({ name: "solicitacao_id", type: "integer" })
  solicitacaoId!: number;

  @ManyToOne(() => Solicitation, { nullable: false, onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @JoinColumn({ name: "solicitacao_id", foreignKeyConstraintName: "solicitation_attachments_solicitacao_fkey" })
  solicitacao!: Relation<Solicitation>;

  @Index("solicitation_attachments_autor_id_idx")
  @Column({ name: "autor_id", type: "uuid" })
  autorId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @JoinColumn({ name: "autor_id", foreignKeyConstraintName: "solicitation_attachments_autor_fkey" })
  autor!: Relation<User>;

  @Column({ name: "nome_original", type: "text" })
  nomeOriginal!: string;

  @Column({ name: "mime_type", type: "text" })
  mimeType!: string;

  @Column({ name: "tamanho_bytes", type: "integer" })
  tamanhoBytes!: number;

  @Column({ name: "storage_key", type: "text" })
  storageKey!: string;

  @CreateDateColumn({ name: "criado_em", type: "timestamptz" })
  criadoEm!: Date;

  @Index("solicitation_attachments_upload_batch_idx")
  @Column({ name: "upload_batch_id", type: "uuid", nullable: true })
  uploadBatchId!: string | null;

  @ManyToOne(() => AttachmentUploadBatch, { nullable: true, onDelete: "NO ACTION", onUpdate: "NO ACTION" })
  @JoinColumn({ name: "upload_batch_id", foreignKeyConstraintName: "solicitation_attachments_upload_batch_fkey" })
  uploadBatch!: Relation<AttachmentUploadBatch> | null;
}
