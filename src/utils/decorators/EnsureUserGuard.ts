import { GuardFunction } from "discordx";
import { CommandInteraction } from "discord.js";
import { ApplicationCommandOptionType, User as DiscordUser } from "discord.js";
import { AppDataSource } from "../../services/database.js";
import { User } from "../../entities/User.js";
import { Exp } from "../../entities/Exp.js";
import { Currency } from "../../entities/Currency.js";
import { GiftStats } from "../../entities/GiftStats.js";
import logger from "../../services/logger.js";

export function EnsureUserGuard(): GuardFunction<CommandInteraction> {
  return async (interaction, _, next) => {
    try {
      const commandUsers: DiscordUser[] = [];

      for (const option of interaction.options.data) {
        if (option.type === ApplicationCommandOptionType.User && option.user) {
          commandUsers.push(option.user);
        }

        if (option.options) {
          for (const subOption of option.options) {
            if (subOption.type === ApplicationCommandOptionType.User && subOption.user) {
              commandUsers.push(subOption.user);
            }
          }
        }
      }

      const hasBot = commandUsers.some(user => user.bot);
      if (hasBot) {
        await interaction.reply({
          content: "⚠️ Ботов нельзя передавать!",
          ephemeral: true
        });
        return;
      }

      const users = [...commandUsers, interaction.user];

      const uniqueUsers = users
        .filter(user => !user.bot)
        .filter((user, index, arr) =>
          arr.findIndex(u => u.id === user.id) === index
        );

      for (const user of uniqueUsers) {
        await createUserIfNeeded(user.id);
      }

      await AppDataSource.manager.queryRunner?.commitTransaction();
      await next();
    } catch (error) {
      logger.error("EnsureUserGuard error:", error);
      await next();
    }
  };
}

async function createUserIfNeeded(discordId: string): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);

  try {
    const existingUser = await userRepo.findOne({
      where: { discordId },
      relations: ["exp", "currency", "giftStats"]
    });

    if (existingUser) return;

    logger.info(`[EnsureUserGuard] Создаем нового пользователя ${discordId}`);

    const newUser = userRepo.create({
      discordId,
      messageCount: 0n,
      voiceMinutes: 0n
    });

    await userRepo.save(newUser);

    const exp = new Exp();
    exp.exp = 0n;
    exp.level = 1;
    exp.user = newUser;
    await AppDataSource.getRepository(Exp).save(exp);

    const currency = new Currency();
    currency.currencyCount = 0n;
    currency.user = newUser;
    await AppDataSource.getRepository(Currency).save(currency);

    const giftStats = new GiftStats();
    giftStats.discordId = discordId;
    giftStats.user = newUser;
    giftStats.trackedVoiceMinutes = 0n;
    giftStats.claimedGiftsFromVoice = 0;
    giftStats.totalGiftsClaimed = 0;
    giftStats.availableGifts = 0;
    await AppDataSource.getRepository(GiftStats).save(giftStats);

    const checkUser = await userRepo.findOne({
      where: { discordId },
      relations: ["exp"]
    });

    if (!checkUser) {
      throw new Error(`Не удалось создать пользователя ${discordId}`);
    }

    logger.info(`[EnsureUserGuard] Успешно создан пользователь ${discordId}`);
  } catch (error) {
    logger.error(`[EnsureUserGuard] Ошибка при создании пользователя ${discordId}:`, error);
    throw error;
  }
}