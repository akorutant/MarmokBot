import { CommandInteraction } from "discord.js";
import { GuardFunction } from "discordx";
import { AppDataSource } from "../../services/database.js";
import { Config } from "../../entities/Config.js";
import logger from "../../services/logger.js";

export function ChannelGuard(configKey: string): GuardFunction<CommandInteraction> {
  return async (interaction, client, next) => {
    try {
      const configRepository = AppDataSource.getRepository(Config);
      
      const configs = await configRepository.find({
        where: { key: configKey }
      });

      if (configs.length === 0) {
        logger.warn(`Конфигурация для ${configKey} не найдена`);
        await interaction.reply({
          content: "❌ Не удалось проверить канал. Обратитесь к администратору.",
          ephemeral: true,
        });
        return;
      }

      const allowedChannelIds = configs
        .flatMap(c => c.value.split(','))
        .map(id => id.trim())
        .filter(id => id.length > 0);

      if (allowedChannelIds.length === 0) {
        logger.warn(`Нет разрешенных каналов в конфигурации ${configKey}`);
        await interaction.reply({
          content: "❌ Нет разрешенных каналов для этой команды",
          ephemeral: true,
        });
        return;
      }

      if (!allowedChannelIds.includes(interaction.channelId)) {
        const channelsList = allowedChannelIds.map(id => `<#${id}>`).join(', ');
        await interaction.reply({
          content: `❌ Эту команду можно использовать только в следующих каналах: ${channelsList}`,
          ephemeral: true,
        });
        return;
      }

      await next();
    } catch (error) {
      logger.error(`Ошибка в ChannelGuard для ${configKey}: %O`, error);
      await interaction.reply({
        content: "❌ Произошла ошибка при проверке канала",
        ephemeral: true,
      });
    }
  };
}