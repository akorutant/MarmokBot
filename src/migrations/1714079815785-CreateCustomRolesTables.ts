import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCustomRolesTables1714079815785 implements MigrationInterface {
    name = 'CreateCustomRolesTables1714079815785'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE \`custom_role\` (
                \`id\` int NOT NULL AUTO_INCREMENT,
                \`name\` varchar(100) NOT NULL,
                \`description\` text NULL,
                \`creatorId\` int NOT NULL,
                \`ownerId\` int NOT NULL,
                \`creationDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`expirationDate\` timestamp NULL,
                \`isActive\` tinyint NOT NULL DEFAULT 1,
                \`lastPaymentDate\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                UNIQUE INDEX \`IDX_custom_role_name\` (\`name\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `);

        await queryRunner.query(`
            CREATE TABLE \`role_share\` (
                \`id\` int NOT NULL AUTO_INCREMENT,
                \`roleId\` int NOT NULL,
                \`userId\` int NOT NULL,
                \`grantedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                UNIQUE INDEX \`idx_unique_role_user\` (\`roleId\`, \`userId\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `);

        await queryRunner.query(`
            CREATE TABLE \`role_history\` (
                \`id\` int NOT NULL AUTO_INCREMENT,
                \`roleId\` int NOT NULL,
                \`actionType\` varchar(50) NOT NULL,
                \`fromUserId\` int NULL,
                \`toUserId\` int NULL,
                \`actionDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`details\` text NULL,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `);

        await queryRunner.query(`
            ALTER TABLE \`custom_role\` 
            ADD CONSTRAINT \`FK_custom_role_creator\` FOREIGN KEY (\`creatorId\`) REFERENCES \`user\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            ADD CONSTRAINT \`FK_custom_role_owner\` FOREIGN KEY (\`ownerId\`) REFERENCES \`user\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE \`role_share\` 
            ADD CONSTRAINT \`FK_role_share_role\` FOREIGN KEY (\`roleId\`) REFERENCES \`custom_role\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
            ADD CONSTRAINT \`FK_role_share_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE \`role_history\` 
            ADD CONSTRAINT \`FK_role_history_role\` FOREIGN KEY (\`roleId\`) REFERENCES \`custom_role\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
            ADD CONSTRAINT \`FK_role_history_from_user\` FOREIGN KEY (\`fromUserId\`) REFERENCES \`user\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            ADD CONSTRAINT \`FK_role_history_to_user\` FOREIGN KEY (\`toUserId\`) REFERENCES \`user\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`role_history\` DROP FOREIGN KEY \`FK_role_history_to_user\``);
        await queryRunner.query(`ALTER TABLE \`role_history\` DROP FOREIGN KEY \`FK_role_history_from_user\``);
        await queryRunner.query(`ALTER TABLE \`role_history\` DROP FOREIGN KEY \`FK_role_history_role\``);
        
        await queryRunner.query(`ALTER TABLE \`role_share\` DROP FOREIGN KEY \`FK_role_share_user\``);
        await queryRunner.query(`ALTER TABLE \`role_share\` DROP FOREIGN KEY \`FK_role_share_role\``);
        
        await queryRunner.query(`ALTER TABLE \`custom_role\` DROP FOREIGN KEY \`FK_custom_role_owner\``);
        await queryRunner.query(`ALTER TABLE \`custom_role\` DROP FOREIGN KEY \`FK_custom_role_creator\``);

        await queryRunner.query(`DROP TABLE \`role_history\``);
        await queryRunner.query(`DROP TABLE \`role_share\``);
        await queryRunner.query(`DROP TABLE \`custom_role\``);
    }
}