import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved", 
  REJECTED = "rejected",
  CANCELLED = "cancelled"
}

@Entity()
export class RoleApproval {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @Column({ length: 100 })
  roleName!: string;

  @Column({ length: 7 })
  roleColor!: string; // HEX формат #FFFFFF

  @Column({ 
    type: "enum", 
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING 
  })
  status!: ApprovalStatus;

  @Column({ nullable: true })
  moderatorId!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "moderatorId" })
  moderator!: Relation<User> | null;

  @Column({ type: "text", nullable: true })
  rejectionReason!: string | null;

  @Column({ length: 100, nullable: true })
  messageId!: string | null; // ID сообщения в канале модерации

  @Column({ length: 100, nullable: true })
  channelId!: string | null; // ID канала модерации

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: "timestamp", nullable: true })
  processedAt!: Date | null;

  // JSON поле для дополнительных данных
  @Column({ type: "json", nullable: true })
  metadata!: {
    originalPrice?: number;
    userBalance?: number;
    guildId?: string;
    interactionId?: string;
  } | null;
}