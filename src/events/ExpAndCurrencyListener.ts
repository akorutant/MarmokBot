import { Discord, On, ArgsOf, Client } from "discordx";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Exp } from "../entities/Exp.js";
import { BlockVoicePresentInChannels } from "../utils/decorators/BlockVoicePresentInChannels.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { CheckLevelUp, setDiscordClient } from "../utils/decorators/CheckLevelUp.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";

const activeVoiceSessions = new Map<string, number>();

@Discord()
class ExpAndCurrencyListener {
  constructor(private client: Client) {
    // Устанавливаем клиент для использования в декораторах
    setDiscordClient(client);
    logger.info("ExpAndCurrencyListener инициализирован с клиентом Discord");
  }

  @On({ event: "messageCreate" })
  @EnsureUser() 
  @CheckLevelUp() // Теперь декоратор не требует передачи клиента
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
  @CheckLevelUp() // Теперь декоратор не требует передачи клиента
  async onVoiceStateUpdate([oldState, newState]: ArgsOf<"voiceStateUpdate">) {
    const userId = newState.id;
    const userRepository = AppDataSource.getRepository(User);
    const expRepository = AppDataSource.getRepository(Exp);
    const currencyRepository = AppDataSource.getRepository(Currency);

    if (!oldState.channel && newState.channel) {
      activeVoiceSessions.set(userId, Date.now());
      logger.info(`Пользователь ${userId} вошёл в голосовой канал`);
    } else if (oldState.channel && !newState.channel) {
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

            await userRepository.increment({ discordId: userId }, "voiceMinutes", minutes);            
            await expRepository.increment({ id: user?.exp.id }, "exp", Number(expToAdd));
            await currencyRepository.increment(
              { id: user?.currency.id }, 
              "currencyCount", 
              Number(currencyToAdd)
            );

            logger.info(
              `Пользователь ${userId} покинул голос. +${minutes} мин, ` +
              `+${expToAdd} EXP, +${currencyToAdd} валюты`
            );
          } catch (error) {
            logger.error("Ошибка при обновлении голосовых данных для %s: %O", userId, error);
          }
        }
        activeVoiceSessions.delete(userId);
      }
    }
  }
}

// Класс для обработки активных голосовых сессий
@Discord()
class VoiceSessionManager {
  @CheckLevelUp() // Теперь декоратор не требует передачи клиента
  async updateActiveVoiceSessions(userId: string, minutes: number) {
    const userRepository = AppDataSource.getRepository(User);
    const expRepository = AppDataSource.getRepository(Exp);
    const currencyRepository = AppDataSource.getRepository(Currency);
    
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

        logger.info(
          `[AUTO] Пользователь ${userId}: +${minutes} мин, ` +
          `+${expToAdd} EXP, +${currencyToAdd} валюты`
        );
      }

      return true;
    } catch (error) {
      logger.error("Ошибка при периодическом обновлении для %s: %O", userId, error);
      return false;
    }
  }
}

// Инициализируем менеджер голосовых сессий
const voiceSessionManager = new VoiceSessionManager();

// Настраиваем интервальную функцию
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

export default ExpAndCurrencyListener;