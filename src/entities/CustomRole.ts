import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn, Index, CreateDateColumn } from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";
import { RoleShare } from "./RoleShare.js";
import { RoleHistory } from "./RoleHistory.js";

@Entity()
export class CustomRole {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 100 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column()
  creatorId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "creatorId" })
  creator!: Relation<User>;

  @Column()
  ownerId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "ownerId" })
  owner!: Relation<User>;

  @CreateDateColumn()
  creationDate!: Date;

  @Column({ type: "timestamp", nullable: true })
  expirationDate!: Date | null;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  lastPaymentDate!: Date;

  @OneToMany(() => RoleShare, roleShare => roleShare.role)
  shares!: Relation<RoleShare[]>;

  @OneToMany(() => RoleHistory, roleHistory => roleHistory.role)
  history!: Relation<RoleHistory[]>;
}