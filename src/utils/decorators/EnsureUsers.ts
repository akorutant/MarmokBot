import { AppDataSource } from "../../services/database.js";
import { User } from "../../entities/User.js";
import { Exp } from "../../entities/Exp.js";
import { Currency } from "../../entities/Currency.js";
import { GiftStats } from "../../entities/GiftStats.js";
import logger from "../../services/logger.js";

/**
 * Декоратор, гарантирующий существование пользователя в базе данных.
 * Всегда создает пользователя и связанные сущности, если они отсутствуют.
 * Боты не будут добавлены в базу данных.
 */
export function EnsureUser() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let discordId: string | undefined;
      let isBot: boolean = false;

      if (args[0]?.author?.id) {
        discordId = args[0].author.id;
        isBot = args[0].author.bot === true;
      }
      else if (args[0]?.[0]?.member?.id || args[0]?.[1]?.member?.id) {
        discordId = (args[0][1]?.member?.id || args[0][0]?.member?.id);
        isBot = (args[0][1]?.member?.user?.bot === true || args[0][0]?.member?.user?.bot === true);
      }
      else if (args.find(arg => arg?.user?.id || arg?.member?.id)) {
        const interaction = args.find(arg => arg?.user?.id || arg?.member?.id);
        discordId = interaction.user?.id || interaction.member?.id;
        isBot = interaction.user?.bot === true || interaction.member?.user?.bot === true;
      }
      else if (args.find(arg => arg?.id && typeof arg.id === 'string')) {
        const userArg = args.find(arg => arg?.id && typeof arg.id === 'string');
        discordId = userArg.id;
        isBot = userArg.bot === true;
      }

      if (!discordId) {
        logger.warn(`EnsureUser: Не удалось определить ID пользователя в ${propertyKey}`);
        return originalMethod.apply(this, args);
      }

      if (isBot) {
        logger.debug(`EnsureUser: Пользователь ${discordId} является ботом, пропускаем`);
        return originalMethod.apply(this, args);
      }

      try {
        const userRepository = AppDataSource.getRepository(User);
        const expRepository = AppDataSource.getRepository(Exp);
        const currencyRepository = AppDataSource.getRepository(Currency);
        const giftStatsRepository = AppDataSource.getRepository(GiftStats);

        let user = await userRepository.findOne({
          where: { discordId },
          relations: ["exp", "currency"]
        });

        if (!user) {
          logger.info(`EnsureUser: Создание нового пользователя ${discordId}`);

          user = userRepository.create({
            discordId,
            messageCount: 0n,
            voiceMinutes: 0n
          });
          await userRepository.save(user);
        }

        if (!user.exp) {
          const newExp = expRepository.create({
            exp: 0n,
            level: 1,
            user
          });
          await expRepository.save(newExp);
          logger.debug(`EnsureUser: Создана запись опыта для пользователя ${discordId}`);
        }

        if (!user.currency) {
          const newCurrency = currencyRepository.create({
            currencyCount: 1000n,
            user
          });
          await currencyRepository.save(newCurrency);
          logger.debug(`EnsureUser: Создана запись валюты для пользователя ${discordId}`);
        }

        const giftStats = await giftStatsRepository.findOne({
          where: { discordId }
        });

        if (!giftStats) {
          const newGiftStats = giftStatsRepository.create({
            discordId,
            userId: user.id,
            user,
            trackedVoiceMinutes: user.voiceMinutes,
            claimedGiftsFromVoice: 0,
            totalGiftsClaimed: 0
          });
          await giftStatsRepository.save(newGiftStats);
          logger.debug(`EnsureUser: Создана запись GiftStats для пользователя ${discordId}`);
        }

      } catch (error) {
        logger.error(`EnsureUser: Ошибка при обработке пользователя ${discordId}: %O`, error);
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}