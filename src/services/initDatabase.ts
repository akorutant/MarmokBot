import { AppDataSource } from "./database.js";
import { Config } from "../entities/Config.js";
import logger from "./logger.js";

export async function seedDefaultConfigs() {
    try {
        const configRepository = AppDataSource.getRepository(Config);
        const count = await configRepository.count();

        if (count === 0) {
            const defaultConfigs = [
                { key: "high_mod_level", value: "372452900531601408" },
                { key: "high_mod_level", value: "345630388460191756" },
                { key: "high_mod_level", value: "1352322947129413654" },
                { key: "high_mod_level", value: "1352385524446527609" },
                { key: "user_commands_channel", value: "1351302655972081787" },
            ];

            await configRepository.save(defaultConfigs);
            logger.info("Default configs inserted:", defaultConfigs);
        } else {
            logger.info("Configs already exist. Seed skipped.");
        }
    } catch (error) {
        logger.error("Ошибка сидирования дефолтных конфигов:", error);
    }
}
