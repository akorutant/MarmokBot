import { Discord, Once, SelectMenuComponent } from "discordx";
import { 
    Client, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    StringSelectMenuInteraction,
    TextChannel,
    GuildMember
} from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import { createEmbed, EmbedColors } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";

@Discord()
export class RoleSelector {
    @Once({ event: "ready" })
    async onReady([client]: [Client]): Promise<void> {
        try {
            const configRepository = AppDataSource.getRepository(Config);
            const roleChannels = await configRepository.find({ where: { key: "give_role_chat" } });
            
            if (roleChannels.length) {
                logger.info(`Найдено ${roleChannels.length} каналов для выдачи ролей`);
            }
            
            logger.info("✅ Обработчики меню ролей готовы к использованию");
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
            
            const allRoleDescs = await configRepository.find({
                where: { key: "role_description" }
            });
            
            const roleDescriptions: Record<string, string> = {};
            for (const desc of allRoleDescs) {
                const [id, ...descParts] = desc.value.split(":");
                if (id) {
                    roleDescriptions[id] = descParts.join(":");
                }
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
            
            logger.info("Допустимые роли: " + JSON.stringify(availableRoles.map(role => role.id)));
            
            const options = availableRoles.map(role => {
                const option = new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setValue(role.id);
                
                const description = roleDescriptions[role.id] || `Нажмите, чтобы получить/убрать роль ${role.name}`;
                option.setDescription(description.substring(0, 100)); 
                
                return option;
            });
            
            const select = new StringSelectMenuBuilder()
                .setCustomId('select-role')
                .setPlaceholder('Выберите роль')
                .addOptions(options);
                
            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(select);
            
            const embed = createEmbed({
                title: "🎭 Выбор ролей",
                description: "Выберите роль из списка ниже, чтобы получить её. Если у вас уже есть выбранная роль, она будет удалена.",
                color: EmbedColors.INFO,
                fields: [
                    {
                        name: "Доступные роли",
                        value: availableRoles.map(role => {
                            const desc = roleDescriptions[role.id] ? 
                                ` - ${roleDescriptions[role.id]}` : '';
                            return `• **${role.name}**${desc}`;
                        }).join('\n')
                    }
                ]
            });
            
            await channel.send({
                embeds: [embed],
                components: [row]
            });
            
            logger.info(`Создано меню выбора ролей в канале ${channel.name}`);
            
        } catch (error) {
            logger.error(`Ошибка при создании меню ролей: ${error}`);
        }
    }
    
    @SelectMenuComponent({ id: "select-role" })
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
            
            logger.info("Роли пользователя: " + JSON.stringify(Array.from(member.roles.cache.keys())));
            
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
}