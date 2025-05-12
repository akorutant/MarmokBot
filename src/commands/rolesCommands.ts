import { Discord, Slash, SlashOption, SlashChoice, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, TextChannel } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { createSuccessEmbed, createErrorEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { RoleSelector } from "../events/RoleSelectorListener.js";
import { Container } from "typedi";

@Discord()
@SlashGroup({
    description: "Команды для управления ролями",
    name: "roles",
    dmPermission: false,
})
@SlashGroup("roles")
export class RoleCommands {
        @Slash({ description: "Создать меню выбора ролей в текущем канале" })
    @Guard(RequireRoles(["high_mod_level"]))
    async chat(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const configRepository = AppDataSource.getRepository(Config);
            
            const isRoleChannel = await configRepository.findOne({
                where: { key: "give_role_chat", value: interaction.channelId }
            });
            
            if (!isRoleChannel) {
                const embed = createErrorEmbed("Этот канал не настроен как канал для выдачи ролей. Сначала используйте /config add с ключом give_role_chat", interaction.user);
                await interaction.editReply({ embeds: [embed] });
                return;
            }
            
            const roleSelector = Container.get(RoleSelector);
            
            await roleSelector.createRoleMenu(interaction.channelId, interaction.client);
            
            const embed = createSuccessEmbed("Меню выбора ролей успешно создано в этом канале.", interaction.user);
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error(`Ошибка при создании меню ролей: ${error}`);
            
            const embed = createErrorEmbed("Произошла ошибка при создании меню ролей.", interaction.user);
            await interaction.editReply({ embeds: [embed] });
        }
    }
}