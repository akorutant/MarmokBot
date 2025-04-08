import { Column, Entity, PrimaryGeneratedColumn, OneToOne, JoinColumn, Relation } from "typeorm";
import type { User } from "./User.js";


@Entity()
export class Currency {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: "bigint",
        default: () => "0",
        unsigned: true,
        transformer: {
            to: (value: bigint) => value.toString(),
            from: (value: string) => BigInt(value),
        },
    })
    currencyCount!: bigint;

    @Column({
        type: "timestamp",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;

    @OneToOne("User", "exp", { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: Relation<User>;
}
