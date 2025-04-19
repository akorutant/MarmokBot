import { Entity, Column, Index, PrimaryGeneratedColumn, OneToOne } from "typeorm";
import type { Relation } from "typeorm";
import type { Exp } from "./Exp.js";
import { Currency } from "./Currency.js";
import { GiftStats } from "./GiftStats.js";

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
      from: (value: string | null) => BigInt(value || '0'), 
    },
  })
  messageCount!: bigint;

  @Column({
    type: "bigint",
    default: () => "0",
    unsigned: true,
    transformer: {
      to: (value: bigint) => value.toString(),
      from: (value: string | null) => BigInt(value || '0'),
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

  @OneToOne("Currency","user")
  currency!: Relation<Currency>;

  @OneToOne("GiftStats", "user")
  giftStats!: Relation<GiftStats>;
}