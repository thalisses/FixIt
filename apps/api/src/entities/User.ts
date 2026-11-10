import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum UserRole {
  CLIENTE = "CLIENTE",
  MANUTENTOR = "MANUTENTOR",
  GESTOR = "GESTOR",
}

export enum UserSpecialty {
  ELETRICA = "ELETRICA",
  HIDRAULICA = "HIDRAULICA",
  INFORMATICA = "INFORMATICA",
  ESTRUTURAL = "ESTRUTURAL",
  OUTROS = "OUTROS",
}

@Entity({ name: "users" })
@Check(
  "users_specialty_role_check",
  `"role" = 'MANUTENTOR' OR "specialty" IS NULL`,
)
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "full_name", type: "varchar", length: 160 })
  fullName!: string;

  @Column({ type: "varchar", length: 320 })
  email!: string;

  @Column({ name: "password_hash", type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ name: "cpf", type: "varchar", length: 14, nullable: true })
  cpf!: string | null;

  @Column({ name: "city_uf", type: "varchar", length: 120, nullable: true })
  cityUf!: string | null;

  @Column({ name: "institution_id", type: "varchar", length: 64 })
  institutionId!: string;

  @Column({
    name: "role",
    type: "enum",
    enum: UserRole,
    enumName: "users_role_enum",
    default: UserRole.CLIENTE,
  })
  role!: UserRole;

  @Column({
    name: "specialty",
    type: "enum",
    enum: UserSpecialty,
    enumName: "user_specialty_enum",
    nullable: true,
  })
  specialty!: UserSpecialty | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({
    name: "created_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: "updated_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  updatedAt!: Date;
}
