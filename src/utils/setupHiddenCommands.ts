import { Client, } from "discordx";
import { ApplicationCommandPermissions, ApplicationCommandPermissionType, ApplicationCommandType, APIGuildApplicationCommandPermissions } from "discord.js";
import logger from "../services/logger.js";

export async function setupCommandPermissions(client: Client, token: string) {
    await client.initApplicationCommands();
    
    const commands = await client.application?.commands.fetch();
    if (!commands) return;

    for (const [commandId, command] of commands) {
        const requiredRoles = Reflect.getMetadata("requiredRoles", client, command.name) as string[];
        
        if (requiredRoles?.length) {
            const permissions: ApplicationCommandPermissions[] = [
                // Запрещаем всем по умолчанию
                {
                    id: command.guild!.roles.everyone.id || command.guildId!,
                    type: ApplicationCommandPermissionType.Role,
                    permission: false
                },
                // Разрешаем указанным ролям
                ...requiredRoles.map(roleId => ({
                    id: roleId,
                    type: ApplicationCommandPermissionType.Role,
                    permission: true
                }))
            ];

            for (const guild of client.guilds.cache.values()) {
                try {
                    await guild.commands.permissions.set({ 
                        command: commandId,
                        permissions,
                        token: token
                    });
                    
                    logger.info(`Updated permissions for ${command.name} in ${guild.name}`);
                } catch (error) {
                    logger.error(`Failed to update permissions for ${command.name}:`, error);
                }
            }
        }
    }
}