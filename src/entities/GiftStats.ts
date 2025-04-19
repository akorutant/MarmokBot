import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne, BeforeInsert, BeforeUpdate } from "typeorm";
import { User } from "./User.js";

@Entity()
export class GiftStats {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  discordId!: string;

  @Column()
  userId!: number;

  @ManyToOne(() => User, user => user.giftStats)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column('bigint', { 
    transformer: {
      from: (value: string | null) => value === null ? BigInt(0) : BigInt(value),
      to: (value: bigint) => String(value)
    },
    default: "0"  
  })
  trackedVoiceMinutes!: bigint;

  @Column({ default: 0 })
  claimedGiftsFromVoice!: number;

  @Column({ default: 0 })
  totalGiftsClaimed!: number;

  @Column({ default: 0 })
  availableGifts!: number;

  @Column({ nullable: true, type: 'datetime' })
  lastDailyGiftClaim!: Date | null;

  @BeforeInsert()
  @BeforeUpdate()
  ensureValidValues() {
    if (this.trackedVoiceMinutes === null || this.trackedVoiceMinutes === undefined) {
      this.trackedVoiceMinutes = BigInt(0);
    }
  }
}