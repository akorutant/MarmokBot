import { GuardFunction } from "discordx";
import type { CommandInteraction } from "discord.js";
import { AppDataSource } from "../../services/database.js";
import { Config } from "../../entities/Config.js";
import logger from "../../services/logger.js";

export function ChannelGuard(configKey: string): GuardFunction<CommandInteraction> {
  return async (interaction, _client, next) => {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      const configRepo = AppDataSource.getRepository(Config);
      const configs = await configRepo.find({ where: { key: configKey } });

      if (configs.length === 0) {
        logger.warn(`Конфигурация для ${configKey} не найдена`);
        await interaction.editReply({
          content: "❌ Не удалось проверить канал. Обратитесь к администратору.",
        });
        return;
      }

      const allowedChannelIds = configs
        .flatMap(c => c.value.split(","))
        .map(id => id.trim())
        .filter(id => id);

      if (allowedChannelIds.length === 0) {
        logger.warn(`Нет разрешенных каналов в конфигурации ${configKey}`);
        await interaction.editReply({
          content: "❌ Нет разрешенных каналов для этой команды",
        });
        return;
      }

      if (!allowedChannelIds.includes(interaction.channelId)) {
        const channelsList = allowedChannelIds.map(id => `<#${id}>`).join(", ");
        await interaction.editReply({
          content: `❌ Эту команду можно использовать только в следующих каналах: ${channelsList}`,
        });
        return;
      }

      if (interaction.deferred) {
        await interaction.deleteReply();
      }

      await next();
    } catch (error) {
      logger.error(`Ошибка в ChannelGuard для ${configKey}: %O`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Произошла ошибка при проверке канала",
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content: "❌ Произошла ошибка при проверке канала",
        });
      }
    }
  };
}
