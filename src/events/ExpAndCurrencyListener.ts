import { Discord, On, ArgsOf } from "discordx";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Exp } from "../entities/Exp.js";
import { VoiceState } from "discord.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";

const activeVoiceSessions = new Map<string, number>();

@Discord()
class ExpAndCurrencyListener {
  @On({ event: "messageCreate" })
  async onMessage([message]: ArgsOf<"messageCreate">) {
    if (message.author.bot) return;

    try {
      const userRepository = AppDataSource.getRepository(User);
      const expRepository = AppDataSource.getRepository(Exp);
      const currencyRepository = AppDataSource.getRepository(Currency);

      let user = await userRepository.findOne({
        where: { discordId: message.author.id },
        relations: ["exp"]
      });

      if (user) {
        await userRepository.increment({ discordId: message.author.id }, "messageCount", 1);
        if (user.exp) {
          await expRepository.increment({ id: user.exp.id }, "exp", 1);
          logger.info(`Пользователь ${message.author.id} +1 EXP`);
        } else {
          const newExp = expRepository.create({ exp: 1n, user });
          await expRepository.save(newExp);
          logger.info(`Пользователь ${message.author.id} +1 EXP`);
        }

        if (user.currency) {
          await currencyRepository.increment({ id: user.currency.id }, "currencyCount", 1);
          logger.info(`Пользователь ${message.author.id} +1 валюта`);
        } else {
          const newCurrency = currencyRepository.create({ currencyCount: 1n, user });
          await currencyRepository.save(newCurrency);
          logger.info(`Пользователь ${message.author.id} +1 валюта`);
        }

      } else {
        const newUser = userRepository.create({
          discordId: message.author.id,
          messageCount: 1n,
          voiceMinutes: 0n
        });
        await userRepository.save(newUser);

        const newExp = expRepository.create({ exp: 1n, user: newUser });
        await expRepository.save(newExp);

        const newCurrency = currencyRepository.create({ currencyCount: 1n, user: newUser });
        await currencyRepository.save(newCurrency);

        logger.info(`Создан новый пользователь ${message.author.id}`);
      }
    } catch (error) {
      logger.error("Ошибка при обработке сообщения от %s: %O", message.author.id, error);
    }
  }

  @On({ event: "voiceStateUpdate" })
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

            if (user) {
              await userRepository.increment({ discordId: userId }, "voiceMinutes", minutes);
              
              if (user.exp) {
                await expRepository.increment({ id: user.exp.id }, "exp", Number(expToAdd));
              } else {
                const newExp = expRepository.create({ exp: expToAdd, user });
                await expRepository.save(newExp);
              }

              if (user.currency) {
                await currencyRepository.increment(
                  { id: user.currency.id }, 
                  "currencyCount", 
                  Number(currencyToAdd)
                );
              } else {
                const newCurrency = currencyRepository.create({ 
                  currencyCount: currencyToAdd, 
                  user 
                });
                await currencyRepository.save(newCurrency);
              }

              logger.info(
                `Пользователь ${userId} покинул голос. +${minutes} мин, ` +
                `+${expToAdd} EXP, +${currencyToAdd} валюты`
              );
            } else {
              const newUser = userRepository.create({
                discordId: userId,
                messageCount: 0n,
                voiceMinutes: BigInt(minutes)
              });
              await userRepository.save(newUser);

              const newExp = expRepository.create({ exp: expToAdd, user: newUser });
              await expRepository.save(newExp);

              const newCurrency = currencyRepository.create({ 
                currencyCount: currencyToAdd, 
                user: newUser 
              });
              await currencyRepository.save(newCurrency);

              logger.info(
                `Создан новый пользователь ${userId}. +${minutes} мин, ` +
                `+${expToAdd} EXP, +${currencyToAdd} валюты`
              );
            }
          } catch (error) {
            logger.error("Ошибка при обновлении голосовых данных для %s: %O", userId, error);
          }
        }
        activeVoiceSessions.delete(userId);
      }
    }
  }
}


setInterval(async () => {
  const userRepository = AppDataSource.getRepository(User);
  const expRepository = AppDataSource.getRepository(Exp);
  const currencyRepository = AppDataSource.getRepository(Currency);
  const now = Date.now();

  for (const [userId, joinTime] of activeVoiceSessions.entries()) {
    const diff = now - joinTime;

    if (diff >= 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      const expToAdd = BigInt(minutes * 5);
      const currencyToAdd = BigInt(minutes);

      try {
        let user = await userRepository.findOne({
          where: { discordId: userId },
          relations: ["exp", "currency"]
        });

        if (user) {
          await userRepository.increment({ discordId: userId }, "voiceMinutes", minutes);
          
          if (user.exp) {
            await expRepository.increment({ id: user.exp.id }, "exp", Number(expToAdd));
          } else {
            const newExp = expRepository.create({ exp: expToAdd, user });
            await expRepository.save(newExp);
          }

          if (user.currency) {
            await currencyRepository.increment(
              { id: user.currency.id }, 
              "currencyCount", 
              Number(currencyToAdd)
            );
          } else {
            const newCurrency = currencyRepository.create({ 
              currencyCount: currencyToAdd, 
              user 
            });
            await currencyRepository.save(newCurrency);
          }

          logger.info(
            `[AUTO] Пользователь ${userId}: +${minutes} мин, ` +
            `+${expToAdd} EXP, +${currencyToAdd} валюты`
          );
        } else {
          const newUser = userRepository.create({
            discordId: userId,
            messageCount: 0n,
            voiceMinutes: BigInt(minutes)
          });
          await userRepository.save(newUser);

          const newExp = expRepository.create({ exp: expToAdd, user: newUser });
          await expRepository.save(newExp);

          const newCurrency = currencyRepository.create({ 
            currencyCount: currencyToAdd, 
            user: newUser 
          });
          await currencyRepository.save(newCurrency);

          logger.info(
            `[AUTO] Новый пользователь ${userId}: +${minutes} мин, ` +
            `+${expToAdd} EXP, +${currencyToAdd} валюты`
          );
        }

        activeVoiceSessions.set(userId, joinTime + minutes * 60 * 1000);
      } catch (error) {
        logger.error("Ошибка при периодическом обновлении для %s: %O", userId, error);
      }
    }
  }
}, 60 * 1000);

export default ExpAndCurrencyListener;
