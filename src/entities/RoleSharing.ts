import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";
import { Inventory } from "./Inventory.js";

export enum SharingStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
  EXPIRED = "expired"
}

@Entity()
export class RoleSharing {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  inventoryId!: number;

  @ManyToOne(() => Inventory, { onDelete: "CASCADE" })
  @JoinColumn({ name: "inventoryId" })
  inventory!: Relation<Inventory>;

  @Column()
  ownerId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ownerId" })
  owner!: Relation<User>;

  @Column()
  sharedWithUserId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sharedWithUserId" })
  sharedWithUser!: Relation<User>;

  @Column({ 
    type: "enum", 
    enum: SharingStatus,
    default: SharingStatus.ACTIVE 
  })
  status!: SharingStatus;

  @CreateDateColumn()
  sharedDate!: Date;

  @Column({ type: "timestamp", nullable: true })
  revokedDate!: Date | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  // Индексы для быстрого поиска
  @Index()
  @Column()
  ownerSharedUserIndex!: string; // owner_id + shared_user_id для уникальности
}

// Можно добавить уникальный индекс для предотвращения дублирования
// @Index(["inventoryId", "sharedWithUserId"], { unique: true })