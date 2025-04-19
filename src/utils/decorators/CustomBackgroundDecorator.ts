import { AppDataSource } from "../../services/database.js";
import { Config } from "../../entities/Config.js";
import logger from "../../services/logger.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { User } from "discord.js";

type ProfileImageParams = [
  user: User,
  messageCount: number,
  voiceMinutes: number,
  level: number,
  currency: number,
  progressPercent: number,
  backgroundImagePath?: string
];

/**
 * Декоратор, который проверяет наличие кастомного фона для профиля пользователя
 * и предоставляет путь к нему при генерации профиля
 */
export function WithCustomBackground() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        const interaction = args[args.length - 1];
        const targetUser = args[0] || interaction.user;
        
        logger.info(`Проверка наличия кастомного фона для пользователя: ${targetUser.id}`);
        
        const customBackgroundPath = await getCustomBackgroundPath(targetUser.id);
        
        if (customBackgroundPath) {
          logger.info(`Найден кастомный фон для пользователя ${targetUser.id}: ${customBackgroundPath}`);
          
          const self = this;
          
          const newArgs = [...args, customBackgroundPath];
          
          return await originalMethod.apply(self, newArgs);
        } else {
          logger.info(`Кастомный фон для пользователя ${targetUser.id} не найден`);
        }

        return originalMethod.apply(this, args);
      } catch (error) {
        logger.error("Ошибка при проверке кастомного фона: %O", error);
        return originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}

/**
 * Получает путь к кастомному фону пользователя, если он существует
 * @param userId ID пользователя
 * @returns Путь к файлу с кастомным фоном или null
 */
async function getCustomBackgroundPath(userId: string): Promise<string | null> {
  try {
    const configRepo = AppDataSource.getRepository(Config);
    const customBackgroundConfig = await configRepo.findOne({
      where: { key: "custom_background", value: userId }
    });
    
    if (!customBackgroundConfig) {
      logger.info(`Запись кастомного фона не найдена для пользователя ${userId}`);
      return null;
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const assetsPath = path.join(__dirname, '../../../assets/images');
    
    const customBackgroundFilename = `${userId}.png`;
    const customBackgroundFullPath = path.join(assetsPath, customBackgroundFilename);
    
    if (fs.existsSync(customBackgroundFullPath)) {
      logger.info(`Найден файл кастомного фона для пользователя ${userId}: ${customBackgroundFullPath}`);
      return customBackgroundFullPath;
    }
    
    logger.warn(`Кастомный фон настроен для пользователя ${userId}, но файл ${customBackgroundFilename} не найден в директории ${assetsPath}`);
    return null;
  } catch (error) {
    logger.error("Ошибка при поиске кастомного фона: %O", error);
    return null;
  }
}