import { Discord, Once } from "discordx";
import { 
    Client, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    StringSelectMenuInteraction,
    ButtonInteraction,
    TextChannel,
    ButtonBuilder,
    ButtonStyle,
    Events,
    GuildMember
} from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import { createEmbed, EmbedColors } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";

@Discord()
export class RoleSelector {
    @Once({ event: "ready" })
    async onReady(client: Client): Promise<void> {
        try {
            const configRepository = AppDataSource.getRepository(Config);
            const roleChannels = await configRepository.find({ where: { key: "give_role_chat" } });
            
            if (roleChannels.length) {
                logger.info(`Найдено ${roleChannels.length} каналов для выдачи ролей`);
            }
            
            client.on(Events.InteractionCreate, async (interaction) => {
                try {
                    if (interaction.isStringSelectMenu() && interaction.customId === 'select-role') {
                        await this.handleRoleSelection(interaction).catch(error => {
                            logger.error(`Ошибка при обработке выбора роли: ${error}`);
                        });
                    }
                    
                    if (interaction.isButton() && interaction.customId === 'refresh-role-menu') {
                        await this.handleRefreshButton(interaction).catch(error => {
                            logger.error(`Ошибка при обновлении меню: ${error}`);
                        });
                    }
                } catch (error) {
                    logger.error(`Ошибка при обработке взаимодействия: ${error}`);
                }
            });
            
            logger.info("✅ Обработчики меню ролей зарегистрированы");
        } catch (error) {
            logger.error(`Ошибка при инициализации меню ролей: ${error}`);
        }
    }
    
    async createRoleMenu(channelId: string, client: Client): Promise<void> {
        try {
            const configRepository = AppDataSource.getRepository(Config);
            
            const roleConfigs = await configRepository.find({ where: { key: "give_role_id" } });
            
            if (!roleConfigs.length) {
                logger.error("Нет настроенных ролей для выдачи");
                return;
            }
            
            const channel = client.channels.cache.get(channelId) as TextChannel;
            if (!channel || !channel.isTextBased()) {
                logger.error(`Канал ${channelId} не найден или не является текстовым`);
                return;
            }
            
            const availableRoles = [];
            for (const roleConfig of roleConfigs) {
                const guild = channel.guild;
                const role = guild.roles.cache.get(roleConfig.value);
                if (role) {
                    availableRoles.push(role);
                }
            }
            
            if (!availableRoles.length) {
                logger.error("Нет доступных ролей для выдачи");
                return;
            }
            
            const options = availableRoles.map(role => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setDescription(`Нажмите, чтобы получить/убрать роль ${role.name}`)
                    .setValue(role.id)
            );
            
            const select = new StringSelectMenuBuilder()
                .setCustomId('select-role')
                .setPlaceholder('Выберите роль')
                .addOptions(options);
                
            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(select);
                
            const refreshButton = new ButtonBuilder()
                .setCustomId('refresh-role-menu')
                .setLabel('Обновить список ролей')
                .setStyle(ButtonStyle.Secondary);
                
            const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(refreshButton);
            
            const embed = createEmbed({
                title: "🎭 Выбор ролей",
                description: "Выберите роль из списка ниже, чтобы получить её. Если у вас уже есть выбранная роль, она будет удалена.",
                color: EmbedColors.INFO,
                fields: [
                    {
                        name: "Доступные роли",
                        value: availableRoles.map(role => `• ${role.name}`).join('\n')
                    }
                ]
            });
            
            await channel.send({
                embeds: [embed],
                components: [row, buttonRow]
            });
            
            logger.info(`Создано меню выбора ролей в канале ${channel.name}`);
            
        } catch (error) {
            logger.error(`Ошибка при создании меню ролей: ${error}`);
        }
    }
    
    async handleRoleSelection(interaction: StringSelectMenuInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true }).catch(error => {
            logger.error(`Ошибка при отложенном ответе: ${error}`);
            return;
        });
        
        try {
            const selectedRoleId = interaction.values[0];
            const selectedRole = interaction.guild?.roles.cache.get(selectedRoleId);
            
            if (!selectedRole) {
                await interaction.editReply({
                    content: '❌ Ошибка: выбранная роль не найдена.'
                }).catch(error => {
                    logger.error(`Ошибка при ответе об отсутствии роли: ${error}`);
                });
                return;
            }
            
            if (!interaction.member || !(interaction.member instanceof GuildMember)) {
                await interaction.editReply({
                    content: '❌ Ошибка: не удалось получить информацию о пользователе.'
                }).catch(error => {
                    logger.error(`Ошибка при ответе о пользователе: ${error}`);
                });
                return;
            }
            
            const member = interaction.member as GuildMember;
            
            if (member.roles.cache.has(selectedRoleId)) {
                try {
                    await member.roles.remove(selectedRoleId);
                    await interaction.editReply({
                        content: `✅ Роль ${selectedRole.name} была удалена.`
                    }).catch(error => {
                        logger.error(`Ошибка при ответе об удалении роли: ${error}`);
                    });
                    logger.info(`Роль ${selectedRole.name} удалена у пользователя ${interaction.user.username}`);
                } catch (roleError) {
                    logger.error(`Ошибка при удалении роли: ${roleError}`);
                    await interaction.editReply({
                        content: '❌ Произошла ошибка при удалении роли. Возможно, бот не имеет необходимых прав.'
                    }).catch(error => {
                        logger.error(`Ошибка при ответе об ошибке удаления роли: ${error}`);
                    });
                }
            } else {
                try {
                    await member.roles.add(selectedRoleId);
                    await interaction.editReply({
                        content: `✅ Вы получили роль ${selectedRole.name}!`
                    }).catch(error => {
                        logger.error(`Ошибка при ответе о добавлении роли: ${error}`);
                    });
                    logger.info(`Роль ${selectedRole.name} выдана пользователю ${interaction.user.username}`);
                } catch (roleError) {
                    logger.error(`Ошибка при добавлении роли: ${roleError}`);
                    await interaction.editReply({
                        content: '❌ Произошла ошибка при добавлении роли. Возможно, бот не имеет необходимых прав.'
                    }).catch(error => {
                        logger.error(`Ошибка при ответе об ошибке добавления роли: ${error}`);
                    });
                }
            }
        } catch (error) {
            logger.error(`Ошибка при выдаче роли: ${error}`);
            try {
                await interaction.editReply({
                    content: '❌ Произошла ошибка при изменении ролей.'
                });
            } catch (replyError) {
                logger.error(`Ошибка при ответе об изменении ролей: ${replyError}`);
            }
        }
    }
    
    async handleRefreshButton(interaction: ButtonInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true }).catch(error => {
            logger.error(`Ошибка при отложенном ответе обновления: ${error}`);
            return;
        });
        
        try {
            await interaction.message.delete().catch(error => {
                logger.error(`Ошибка при удалении сообщения: ${error}`);
            });
            
            await this.createRoleMenu(interaction.channelId, interaction.client);
            
            await interaction.editReply({
                content: '✅ Меню ролей обновлено.'
            }).catch(error => {
                logger.error(`Ошибка при ответе об обновлении меню: ${error}`);
            });
            
        } catch (error) {
            logger.error(`Ошибка при обновлении меню ролей: ${error}`);
            try {
                await interaction.editReply({
                    content: '❌ Произошла ошибка при обновлении меню ролей.'
                });
            } catch (replyError) {
                logger.error(`Ошибка при ответе об ошибке обновления меню: ${replyError}`);
            }
        }
    }
}