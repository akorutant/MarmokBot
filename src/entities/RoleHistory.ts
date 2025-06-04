import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";
import { CustomRole } from "./CustomRole.js";

@Entity()
export class RoleHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  roleId!: number;

  @ManyToOne(() => CustomRole, role => role.history, { onDelete: "CASCADE" })
  @JoinColumn({ name: "roleId" })
  role!: Relation<CustomRole>;

  @Column({ length: 50 })
  actionType!: string;  
  
  @Column({ nullable: true })
  fromUserId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "fromUserId" })
  fromUser!: Relation<User> | null;

  @Column({ nullable: true })
  toUserId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "toUserId" })
  toUser!: Relation<User> | null;

  @CreateDateColumn()
  actionDate!: Date;

  @Column({ type: "text", nullable: true })
  details!: string | null;
}