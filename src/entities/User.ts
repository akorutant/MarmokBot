import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

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
      from: (value: string) => BigInt(value)
    }
  })
  exp!: bigint;

  @Column({
    type: "int",
    default: 0,
    unsigned: true,
  })
  voiceMinutes!: number;

  @Column({ 
    type: "timestamp", 
    default: () => "CURRENT_TIMESTAMP" 
  })
  createdAt!: Date;
}
