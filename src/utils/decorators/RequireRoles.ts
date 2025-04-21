import { ButtonInteraction, CommandInteraction } from "discord.js";
import { GuardFunction } from "discordx";
import { userHasAnyRoleFromConfig } from "../userHasAnyRoleFromConfig.js";
import logger from "../../services/logger.js";

/**
 * Guard для скрытия команд + проверки ролей (аналог CheckMoney)
 * @param configKeys - Ключи ролей из конфига (например, ["admin_role_id"])
 * @param denyMessage - Сообщение при отказе (опционально)
 */
export const RequireRoles: (
    configKeys: string[],
    denyMessage?: string
) => GuardFunction<CommandInteraction> = (
    configKeys,
    denyMessage = "❌ У вас нет прав для этой команды"
) => {
    return async (interaction, _, next) => {
        try {
            const hasAccess = await userHasAnyRoleFromConfig(interaction, configKeys);

            if (!hasAccess) {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: denyMessage,
                        ephemeral: true,
                    });
                }
                return; 
            }

            await next();
        } catch (error) {
            logger.error(`RequireRolesHide Error (${interaction.commandName}):`, error);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: "❌ Ошибка проверки прав доступа",
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: "❌ Ошибка проверки прав доступа",
                    ephemeral: true,
                });
            }
        }
    };
};