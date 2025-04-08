import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Config {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: "varchar",
        length: 255
    })
    key!: string;

    @Column({
        type: "varchar",
        unique: true,
        length: 255
    })
    value!: string;

    @Column({
        type: "timestamp",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
