import { CommandInteraction } from "discord.js";
import { GuardFunction } from "discordx";
import { AppDataSource } from "../../services/database.js";
import { Config } from "../../entities/Config.js";
import logger from "../../services/logger.js";
import { User } from "../../entities/User.js";


export function CheckMoney(): GuardFunction<CommandInteraction> {
  return async (interaction, client, next) => {
    try {
      const betOption = interaction.options.get("bet");
      if (!betOption?.value) {
        await interaction.reply({
          content: "❌ Не указана ставка",
          ephemeral: true,
        });
        return;
      }

      const bet = Number(betOption.value);
      if (isNaN(bet)) {
        await interaction.reply({
          content: "❌ Ставка должна быть числом",
          ephemeral: true,
        });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { discordId: interaction.user.id },
        relations: ["currency"],
      });

      if (!user || !user.currency) {
        await interaction.reply({
          content: "❌ Ваш аккаунт не найден в системе",
          ephemeral: true,
        });
        return;
      }

      if (user.currency.currencyCount < BigInt(bet)) {
        await interaction.reply({
          content: "❌ У вас недостаточно денег для этой ставки",
          ephemeral: true,
        });
        return;
      }

      await next();
    } catch (error) {
      logger.error(`Ошибка в CheckMoney: %O`, error);
      await interaction.reply({
        content: "❌ Произошла ошибка при проверке баланса",
        ephemeral: true,
      });
    }
  };
}

