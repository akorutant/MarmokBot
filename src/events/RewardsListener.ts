import { Discord, On, ArgsOf, Client } from "discordx";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Exp } from "../entities/Exp.js";
import { BlockVoicePresentInChannels } from "../utils/decorators/BlockVoicePresentInChannels.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { CheckLevelUp, setDiscordClient } from "../utils/decorators/CheckLevelUp.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";
import { GiftStats } from "../entities/GiftStats.js";
import { VoiceGiftService } from "../services/voiceGiftSerivce.js";

const activeVoiceSessions = new Map<string, number>();
// Объявляем переменную для хранения экземпляра клиента
let discordClient: Client | undefined = undefined;

@Discord()
class RewardsListener {
  private voiceGiftService: VoiceGiftService;

  constructor(private client: Client) {
    setDiscordClient(client);
    discordClient = client; // Сохраняем экземпляр клиента для использования в других местах
    this.voiceGiftService = new VoiceGiftService(client);
    logger.info("RewardsListener инициализирован с клиентом Discord");
  }

  @On({ event: "messageCreate" })
  @EnsureUser() 
  @CheckLevelUp()
  async onMessage([message]: ArgsOf<"messageCreate">) {
    if (message.author.bot) return;

    try {
      const userRepository = AppDataSource.getRepository(User);
      const expRepository = AppDataSource.getRepository(Exp);
      const currencyRepository = AppDataSource.getRepository(Currency);

      let user = await userRepository.findOne({
        where: { discordId: message.author.id },
        relations: ["exp", "currency"]
      });

      await userRepository.increment({ discordId: message.author.id }, "messageCount", 1);
      
      await expRepository.increment({ id: user?.exp.id }, "exp", 1);
      logger.info(`Пользователь ${message.author.id} +1 EXP`);
      
      await currencyRepository.increment({ id: user?.currency.id }, "currencyCount", 1);
      logger.info(`Пользователь ${message.author.id} +1 валюта`);
    } catch (error) {
      logger.error("Ошибка при обработке сообщения от %s: %O", message.author.id, error);
    }
  }

  @On({ event: "voiceStateUpdate" })
  @BlockVoicePresentInChannels()
  @EnsureUser()
  @CheckLevelUp()
  async onVoiceStateUpdate([oldState, newState]: ArgsOf<"voiceStateUpdate">) {
    const userId = newState.id;
    const userRepository = AppDataSource.getRepository(User);
    const expRepository = AppDataSource.getRepository(Exp);
    const currencyRepository = AppDataSource.getRepository(Currency);

    if (!oldState.channel && newState.channel) {
      // Пользователь присоединился к голосовому каналу
      activeVoiceSessions.set(userId, Date.now());
      logger.info(`Пользователь ${userId} вошёл в голосовой канал`);
    } else if (oldState.channel && !newState.channel) {
      // Пользователь покинул голосовой канал
      const joinTime = activeVoiceSessions.get(userId);
      if (joinTime) {
        const diff = Date.now() - joinTime;
        const minutes = Math.floor(diff / (60 * 1000));

        if (minutes > 0) {
          const expToAdd = BigInt(minutes * 5);
          const currencyToAdd = BigInt(minutes);
          
          try {
            let user = await userRepository.findOne({
              where: { discordId: userId },
              relations: ["exp", "currency"]
            });

            if (!user) {
              logger.error(`Пользователь ${userId} не найден при обновлении голосовых данных`);
              return;
            }

            await userRepository.increment({ discordId: userId }, "voiceMinutes", minutes);            
            await expRepository.increment({ id: user.exp.id }, "exp", Number(expToAdd));
            await currencyRepository.increment(
              { id: user.currency.id }, 
              "currencyCount", 
              Number(currencyToAdd)
            );

            // Обновляем GiftStats, чтобы отслеживать накопление времени
            await this.updateGiftStats(userId, minutes);

            logger.info(
              `Пользователь ${userId} покинул голос. +${minutes} мин, ` +
              `+${expToAdd} EXP, +${currencyToAdd} валюты`
            );

            // Проверяем и выдаем подарки, если пользователь достиг необходимого времени
            await this.voiceGiftService.checkAndAwardGifts(userId);
          } catch (error) {
            logger.error("Ошибка при обновлении голосовых данных для %s: %O", userId, error);
          }
        }
        activeVoiceSessions.delete(userId);
      }
    }
  }

  /**
   * Обновляет статистику подарков при изменении времени в голосовом канале
   */
  private async updateGiftStats(userId: string, minutes: number): Promise<void> {
    try {
      const giftStatsRepository = AppDataSource.getRepository(GiftStats);
      const userRepository = AppDataSource.getRepository(User);
      
      // Получаем текущего пользователя
      const user = await userRepository.findOne({
        where: { discordId: userId }
      });
      
      if (!user) {
        logger.warn(`Не удалось найти пользователя ${userId} для обновления GiftStats`);
        return;
      }
      
      // Проверяем, есть ли запись в GiftStats
      let giftStats = await giftStatsRepository.findOne({
        where: { discordId: userId }
      });
      
      if (!giftStats) {
        // Если записи нет, создаем новую
        giftStats = giftStatsRepository.create({
          discordId: userId,
          userId: user.id,
          user: user,
          trackedVoiceMinutes: user.voiceMinutes // Начинаем отслеживать с текущего значения
        });
        await giftStatsRepository.save(giftStats);
      } else {
        // Обновляем отслеживаемое время
        giftStats.trackedVoiceMinutes = user.voiceMinutes;
        await giftStatsRepository.save(giftStats);
      }
      
      logger.debug(`Обновлена статистика подарков для пользователя ${userId}: ${Number(giftStats.trackedVoiceMinutes)} минут`);
    } catch (error) {
      logger.error(`Ошибка при обновлении статистики подарков для ${userId}: ${error}`);
    }
  }
}

@Discord()
class VoiceSessionManager {
  private voiceGiftService: VoiceGiftService | null = null;

  constructor() {
    // Используем discordClient, который был инициализирован в RewardsListener
    if (discordClient) {
      this.voiceGiftService = new VoiceGiftService(discordClient);
    }
  }

  @CheckLevelUp() 
  async updateActiveVoiceSessions(userId: string, minutes: number) {
    const userRepository = AppDataSource.getRepository(User);
    const expRepository = AppDataSource.getRepository(Exp);
    const currencyRepository = AppDataSource.getRepository(Currency);
    const giftStatsRepository = AppDataSource.getRepository(GiftStats);
    
    const expToAdd = BigInt(minutes * 5);
    const currencyToAdd = BigInt(minutes);

    try {
      let user = await userRepository.findOne({
        where: { discordId: userId },
        relations: ["exp", "currency"]
      });

      if (!user) {
        user = userRepository.create({
          discordId: userId,
          messageCount: 0n,
          voiceMinutes: BigInt(minutes)
        });
        await userRepository.save(user);

        const newExp = expRepository.create({ 
          exp: expToAdd, 
          level: 1,
          user 
        });
        await expRepository.save(newExp);

        const newCurrency = currencyRepository.create({ 
          currencyCount: currencyToAdd, 
          user 
        });
        await currencyRepository.save(newCurrency);

        // Создаем запись GiftStats для нового пользователя
        const newGiftStats = giftStatsRepository.create({
          discordId: userId,
          userId: user.id,
          user: user,
          trackedVoiceMinutes: BigInt(minutes),
          claimedGiftsFromVoice: 0,
          totalGiftsClaimed: 0,
          lastDailyGiftClaim: null
        });
        await giftStatsRepository.save(newGiftStats);

        logger.info(
          `[AUTO] Новый пользователь ${userId}: +${minutes} мин, ` +
          `+${expToAdd} EXP, +${currencyToAdd} валюты`
        );
      } else {
        await userRepository.increment({ discordId: userId }, "voiceMinutes", minutes);
        await expRepository.increment({ id: user.exp.id }, "exp", Number(expToAdd));
        await currencyRepository.increment(
          { id: user.currency.id }, 
          "currencyCount", 
          Number(currencyToAdd)
        );

        // Обновляем GiftStats
        let giftStats = await giftStatsRepository.findOne({
          where: { discordId: userId }
        });
        
        if (giftStats) {
          giftStats.trackedVoiceMinutes = user.voiceMinutes + BigInt(minutes);
          await giftStatsRepository.save(giftStats);
        } else {
          // Если по какой-то причине записи GiftStats нет, создаем ее
          const newGiftStats = giftStatsRepository.create({
            discordId: userId,
            userId: user.id,
            user: user,
            trackedVoiceMinutes: user.voiceMinutes + BigInt(minutes),
            claimedGiftsFromVoice: 0,
            totalGiftsClaimed: 0,
            lastDailyGiftClaim: null
          });
          await giftStatsRepository.save(newGiftStats);
        }

        logger.info(
          `[AUTO] Пользователь ${userId}: +${minutes} мин, ` +
          `+${expToAdd} EXP, +${currencyToAdd} валюты`
        );
      }

      // Проверяем и выдаем подарки, если пользователь достиг необходимого времени
      if (this.voiceGiftService) {
        await this.voiceGiftService.checkAndAwardGifts(userId);
      }

      return true;
    } catch (error) {
      logger.error("Ошибка при периодическом обновлении для %s: %O", userId, error);
      return false;
    }
  }
}

const voiceSessionManager = new VoiceSessionManager();

setInterval(async () => {
  const now = Date.now();

  for (const [userId, joinTime] of activeVoiceSessions.entries()) {
    const diff = now - joinTime;

    if (diff >= 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      
      if (minutes > 0) {
        const success = await voiceSessionManager.updateActiveVoiceSessions(userId, minutes);
        
        if (success) {
          activeVoiceSessions.set(userId, joinTime + minutes * 60 * 1000);
        }
      }
    }
  }
}, 60 * 1000);

export default RewardsListener;