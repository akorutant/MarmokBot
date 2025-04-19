import { AppDataSource } from "./database.js";
import { Config } from "../entities/Config.js";
import { GiftStats } from "../entities/GiftStats.js";
import { User } from "../entities/User.js";
import logger from "./logger.js";

export async function seedDefaultConfigs() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
            AppDataSource.entityMetadatas.forEach(metadata => {
                console.log(`Loaded entity: ${metadata.name}`);
            });
        }

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

        // Проверяем и инициализируем таблицу GiftStats
        await initializeGiftStats();
    } catch (error) {
        logger.error("Ошибка сидирования дефолтных конфигов:", error);
    }
}

/**
 * Инициализирует таблицу GiftStats для уже существующих пользователей
 */
async function initializeGiftStats() {
    try {
        const userRepository = AppDataSource.getRepository(User);
        const giftStatsRepository = AppDataSource.getRepository(GiftStats);
        
        const giftStatsCount = await giftStatsRepository.count();
        
        if (giftStatsCount > 0) {
            logger.info("Таблица GiftStats уже содержит записи, пропускаем инициализацию");
            return;
        }
        
        const users = await userRepository.find();
        logger.info(`Найдено ${users.length} пользователей для инициализации GiftStats`);
        
        if (users.length === 0) {
            logger.info("Нет пользователей для инициализации GiftStats");
            return;
        }
        
        const giftStatsBatch = users.map(user => ({
            discordId: user.discordId,
            userId: user.id,
            user: user,
            trackedVoiceMinutes: user.voiceMinutes,
            claimedGiftsFromVoice: 0,
            totalGiftsClaimed: 0,
            lastDailyGiftClaim: null
        }));
        
        await giftStatsRepository.save(giftStatsBatch);
        logger.info(`Инициализировано ${giftStatsBatch.length} записей в таблице GiftStats`);
    } catch (error) {
        logger.error("Ошибка при инициализации таблицы GiftStats:", error);
    }
}