import { Entity, Column, PrimaryGeneratedColumn, OneToOne, JoinColumn } from "typeorm";
import type { Relation } from "typeorm";
import type { User } from "./User.js";

@Entity()
export class Exp {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: "bigint",
    default: () => "0",
    unsigned: true,
    transformer: {
      to: (value: bigint) => value.toString(),
      from: (value: string | null) => BigInt(value || '0'),
    },
  })
  exp!: bigint;

  @Column({
    type: "int",
    unsigned: true,
  })
  level!: number;

  @Column({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;

  @OneToOne("User", "exp", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;
}