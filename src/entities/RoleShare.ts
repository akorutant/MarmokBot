import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";
import { CustomRole } from "./CustomRole.js";

@Entity()
export class RoleShare {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  roleId!: number;

  @ManyToOne(() => CustomRole, role => role.shares, { onDelete: "CASCADE" })
  @JoinColumn({ name: "roleId" })
  role!: Relation<CustomRole>;

  @Column()
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @CreateDateColumn()
  grantedDate!: Date;

  @Index("idx_unique_role_user", ["roleId", "userId"], { unique: true })
  uniqueRoleUser!: any; 
}