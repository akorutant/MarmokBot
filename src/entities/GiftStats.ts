import { Entity, Column, Index, PrimaryGeneratedColumn, OneToOne, JoinColumn } from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";

@Entity()
export class GiftStats {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToOne(() => User)
  @JoinColumn()
  user!: Relation<User>;

  @Column()
  userId!: number;

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
  trackedVoiceMinutes!: bigint;

  @Column({
    type: "int",
    default: 0,
    unsigned: true,
  })
  claimedGiftsFromVoice!: number;

  @Column({
    type: "timestamp",
    nullable: true,
  })
  lastDailyGiftClaim!: Date | null;

  @Column({
    type: "int",
    default: 0,
    unsigned: true,
  })
  totalGiftsClaimed!: number;

  @Column({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;

  @Column({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP",
  })
  updatedAt!: Date;
}