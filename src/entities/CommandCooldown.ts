import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity()
export class CommandCooldown {
    @PrimaryColumn()
    userId!: string;

    @PrimaryColumn()
    commandName!: string;

    @Column()
    lastUsed!: Date;
}