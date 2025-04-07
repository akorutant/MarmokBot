import { Entity, Column, Index, PrimaryGeneratedColumn, OneToOne } from "typeorm";
import type { Relation } from "typeorm";
import type { Exp } from "./Exp.js";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column()
  discordId!: string;

  @Column({
    type: "bigint",
    default: () => "0",
    unsigned: true,
    transformer: {
      to: (value: bigint) => value.toString(),
      from: (value: string) => BigInt(value),
    },
  })
  messageCount!: bigint;

  @Column({
    type: "bigint",
    default: () => "0",
    unsigned: true,
    transformer: {
      to: (value: bigint) => value.toString(),
      from: (value: string) => BigInt(value),
    },
  })
  voiceMinutes!: bigint;

  @Column({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;

  @OneToOne("Exp", "user")
  exp!: Relation<Exp>;
}