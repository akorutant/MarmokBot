import { GuardFunction } from "discordx";
import type { CommandInteraction } from "discord.js";
import { AppDataSource } from "../../services/database.js";
import { Config } from "../../entities/Config.js";
import logger from "../../services/logger.js";

export function ChannelGuard(configKey: string): GuardFunction<CommandInteraction> {
  return async (interaction, _client, next) => {
    try {
      const configRepo = AppDataSource.getRepository(Config);
      const configs = await configRepo.find({ where: { key: configKey } });

      if (configs.length === 0) {
        logger.warn(`ChannelGuard: config '${configKey}' not found`);
        await interaction.reply({
          content: "❌ Не удалось проверить канал. Обратитесь к разработчикам.",
          ephemeral: true,
        });
        return;
      }

      const allowedChannelIds = configs
        .flatMap(c => c.value.split(","))
        .map(id => id.trim())
        .filter(id => id);

      if (!allowedChannelIds.length) {
        logger.warn(`ChannelGuard: no channels configured for '${configKey}'`);
        await interaction.reply({
          content: "❌ Нет разрешенных каналов для этой команды.",
          ephemeral: true,
        });
        return;
      }

      if (!allowedChannelIds.includes(interaction.channelId)) {
        const list = allowedChannelIds.map(id => `<#${id}>`).join(", ");
        await interaction.reply({
          content: `❌ Эту команду можно использовать только в следующих каналах: ${list}`,
          ephemeral: true,
        });
        return;
      }

      await next();
    } catch (error) {
      logger.error(`ChannelGuard error for '${configKey}':`, error);
      await next();
    }
  };
}
