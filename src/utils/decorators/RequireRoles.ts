import { ButtonInteraction, CommandInteraction } from "discord.js";
import { GuardFunction } from "discordx";
import { userHasAnyRoleFromConfig } from "../userHasAnyRoleFromConfig.js";
import logger from "../../services/logger.js";

export function RequireRoles(configKeys: string[]): GuardFunction<CommandInteraction> {
  return async (interaction, _, next) => {
    try {
      // Проверяем, есть ли у пользователя нужные роли
      const hasAccess = await userHasAnyRoleFromConfig(interaction, configKeys);

      if (!hasAccess) {
        await interaction.reply({
          content: "❌ У вас нет прав для использования этой команды.",
          ephemeral: true
        });
        return;
      }

      // Если проверка пройдена, продолжаем выполнение
      await next();
    } catch (error) {
      logger.error("RequireRoles error:", error);

      // Отправляем сообщение об ошибке, если что-то пошло не так
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "❌ Произошла ошибка при проверке прав доступа.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: "❌ Произошла ошибка при проверке прав доступа.",
          ephemeral: true
        });
      }
    }
  };
}