import { Discord, SlashGroup, Slash, SlashOption, SlashChoice, Guard } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, Attachment } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { createSuccessEmbed, createErrorEmbed, createEmbed, EmbedColors } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import axios from "axios";

@Discord()
@SlashGroup({ 
    description: "Команды для изменения конфига", 
    name: "config",
    defaultMemberPermissions: "0", 
    dmPermission: false, 
})
@SlashGroup("config")
class ConfigCommands {
    @Slash({ description: "Добавить значение в конфиг" })
    @Guard(RequireRoles(["high_mod_level", "medium_mod_level"]))
    async add(
        @SlashChoice({ name: "Low Moderation Level", value: "low_mod_level" })
        @SlashChoice({ name: "Medium Moderation Level", value: "medium_mod_level" })
        @SlashChoice({ name: "High Moderation Level", value: "high_mod_level" })
        @SlashChoice({ name: "Ignore Voice Channel For EXP", value: "ignore_voice_channel_exp" })
        @SlashChoice({ name: "Allow chat commands for users ", value: "user_commands_channel" })
        @SlashChoice({ name: "Gallery chat for reactions", value: "gallery_chat" })
        @SlashChoice({ name: "Chat ID for logs messages", value: "log_chat"})
        @SlashChoice({ name: "Chat ID for giving roles", value: "give_role_chat" })
        @SlashChoice({ name: "Role ID for give to user", value: "give_role_id" })
        @SlashChoice({ name: "Role description", value: "role_description" })
        @SlashOption({
            description: "Выберите ключ конфига",
            name: "key",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        key: string,
        @SlashOption({
            description: "Введите значение для ключа",
            name: "value",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        value: string,
        interaction: CommandInteraction
    ) {
        try {
            const configRepository = AppDataSource.getRepository(Config);
            
            // Особая логика для описаний ролей
            if (key === "role_description") {
                // Проверяем формат - должен быть "roleId:description"
                const parts = value.split(":", 2);
                if (parts.length !== 2 || !parts[0] || !parts[1]) {
                    const embed = createErrorEmbed(
                        "Неверный формат. Для описания ролей используйте формат 'roleId:описание'", 
                        interaction.user
                    );
                    return interaction.reply({ embeds: [embed] });
                }
                
                const roleId = parts[0];
                const description = parts[1];
                
                // Проверяем существование роли
                const role = interaction.guild?.roles.cache.get(roleId);
                if (!role) {
                    const embed = createErrorEmbed(
                        `Роль с ID ${roleId} не найдена на сервере`,
                        interaction.user
                    );
                    return interaction.reply({ embeds: [embed] });
                }
                
                const existingRole = await configRepository.findOne({
                    where: { key: "give_role_id", value: roleId }
                });
                
                if (!existingRole) {
                    const embed = createErrorEmbed(
                        `Роль ${role.name} не добавлена в список доступных для выдачи. Сначала добавьте её через /config add key:give_role_id value:${roleId}`,
                        interaction.user
                    );
                    return interaction.reply({ embeds: [embed] });
                }
                
                if (description.length > 100) {
                    const embed = createErrorEmbed(
                        "Описание роли слишком длинное (более 100 символов). Пожалуйста, сократите его.",
                        interaction.user
                    );
                    return interaction.reply({ embeds: [embed] });
                }
                
                const existingDescs = await configRepository.find({
                    where: { key: "role_description" }
                });
                
                const existingDesc = existingDescs.find(config => 
                    config.value.startsWith(`${roleId}:`)
                );
                
                if (existingDesc) {
                    await configRepository.delete(existingDesc.id);
                    logger.info(`Удалено старое описание роли ${role.name}`);
                }
            }
            
            const newConfig = configRepository.create({ key, value });
            await configRepository.save(newConfig);
            logger.info(`Добавлен новый конфиг ${key} = ${value}`);
    
            const embed = createSuccessEmbed(`Конфиг **${key}** установлен: \`${value}\``, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка обновления конфига:", error);
    
            const embed = createErrorEmbed("Ошибка при сохранении конфига", interaction.user);
            await interaction.reply({ embeds: [embed] });
        }
    }

    @Slash({ description: "Установить кастомный фон профиля" })
    @Guard(RequireRoles(["high_mod_level"]))
    async setbackground(
        @SlashOption({
            description: "Изображение для фона профиля (PNG)",
            name: "image",
            required: true,
            type: ApplicationCommandOptionType.Attachment
        })
        attachment: Attachment,
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();

            const userId = interaction.user.id;
            
            if (!attachment.contentType?.startsWith('image/')) {
                const embed = createErrorEmbed("Загруженный файл не является изображением.", interaction.user);
                return interaction.editReply({ embeds: [embed] });
            }

            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const assetsPath = path.join(__dirname, '../../assets/images');
            const customBackgroundFullPath = path.join(assetsPath, `${userId}.png`);

            if (!fs.existsSync(assetsPath)) {
                fs.mkdirSync(assetsPath, { recursive: true });
                logger.info(`Создана директория для хранения изображений: ${assetsPath}`);
            }

            const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
            fs.writeFileSync(customBackgroundFullPath, Buffer.from(response.data));
            logger.info(`Фоновое изображение сохранено для пользователя ${userId}: ${customBackgroundFullPath}`);

            const configRepository = AppDataSource.getRepository(Config);
            const existingConfig = await configRepository.findOne({
                where: { key: "custom_background", value: userId }
            });

            if (!existingConfig) {
                const newConfig = configRepository.create({ key: "custom_background", value: userId });
                await configRepository.save(newConfig);
                logger.info(`Добавлен новый конфиг custom_background = ${userId}`);
            }

            const embed = createSuccessEmbed(
                `Установлен кастомный фон для вашего профиля!`, 
                interaction.user
            );
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка при установке кастомного фона:", error);
            const embed = createErrorEmbed("Произошла ошибка при установке кастомного фона.", interaction.user);
            await interaction.editReply({ embeds: [embed] });
        }
    }

    @Slash({ description: "Убрать кастомный фон профиля" })
    @Guard(RequireRoles(["high_mod_level"]))
    async removebackground(
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            const userId = interaction.user.id;

            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const assetsPath = path.join(__dirname, '../../assets/images');
            const customBackgroundFullPath = path.join(assetsPath, `${userId}.png`);

            let fileDeleted = false;
            if (fs.existsSync(customBackgroundFullPath)) {
                fs.unlinkSync(customBackgroundFullPath);
                fileDeleted = true;
                logger.info(`Удален файл фона для пользователя ${userId}: ${customBackgroundFullPath}`);
            }

            const configRepository = AppDataSource.getRepository(Config);
            const result = await configRepository.delete({
                key: "custom_background",
                value: userId
            });

            if (result.affected === 0 && !fileDeleted) {
                const embed = createErrorEmbed(`У вас не установлен кастомный фон.`, interaction.user);
                return interaction.editReply({ embeds: [embed] });
            }

            logger.info(`Удален конфиг custom_background для пользователя ${userId}`);
            const embed = createSuccessEmbed(
                `Кастомный фон для вашего профиля удален.`, 
                interaction.user
            );
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка при удалении кастомного фона:", error);
            const embed = createErrorEmbed("Произошла ошибка при удалении кастомного фона.", interaction.user);
            await interaction.editReply({ embeds: [embed] });
        }
    }

    @Slash({ description: "Удалить значение конфига" })
    @Guard(RequireRoles(["high_mod_level", "medium_mod_level"]))
    async remove(
        @SlashChoice({ name: "Low Moderation Level", value: "low_mod_level" })
        @SlashChoice({ name: "Medium Moderation Level", value: "medium_mod_level" })
        @SlashChoice({ name: "High Moderation Level", value: "high_mod_level" })
        @SlashChoice({ name: "Ignore Voice Channel For EXP", value: "ignore_voice_channel_exp" })
        @SlashChoice({ name: "Allow chat commands for users ", value: "user_commands_channel" })
        @SlashChoice({ name: "Custom Background For Profile", value: "custom_background" })
        @SlashChoice({ name: "Gallery chat for reactions", value: "gallery_chat" })
        @SlashChoice({ name: "Chat ID for logs messages", value: "log_chat"})
        @SlashChoice({ name: "Chat ID for giving roles", value: "give_role_chat" })
        @SlashChoice({ name: "Role ID for give to user", value: "give_role_id" })
        @SlashChoice({ name: "Role description", value: "role_description" })
        @SlashOption({
            description: "Выберите ключ для удаления",
            name: "key",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        key: string,
        @SlashOption({
            description: "Впишите значение ключа для удаления",
            name: "value",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        value: string,
        interaction: CommandInteraction
    ) {
        try {
            const configRepository = AppDataSource.getRepository(Config);
            
            if (key === "role_description") {
                if (!value.includes(":")) {
                    const roleId = value;
                    
                    const existingDescs = await configRepository.find({
                        where: { key: "role_description" }
                    });
                    
                    const existingDesc = existingDescs.find(config => 
                        config.value.startsWith(`${roleId}:`)
                    );
                    
                    if (!existingDesc) {
                        const embed = createErrorEmbed(`Описание для роли с ID ${roleId} не найдено`, interaction.user);
                        return interaction.reply({ embeds: [embed] });
                    }
                    
                    await configRepository.delete(existingDesc.id);
                    logger.info(`Удалено описание для роли с ID ${roleId}`);
                    
                    const embed = createSuccessEmbed(`Описание для роли с ID ${roleId} успешно удалено`, interaction.user);
                    await interaction.reply({ embeds: [embed] });
                    return;
                }
            }
            
            const result = await configRepository.delete({ key, value });
    
            if (result.affected === 0) {
                const embed = createErrorEmbed(`Конфиг **${key}** **${value}** не найден`, interaction.user);
                return interaction.reply({ embeds: [embed] });
            }
    
            if (key === "custom_background") {
                try {
                    const __filename = fileURLToPath(import.meta.url);
                    const __dirname = path.dirname(__filename);
                    const assetsPath = path.join(__dirname, '../../assets/images');
                    const customBackgroundFullPath = path.join(assetsPath, `${value}.png`);
                    
                    if (fs.existsSync(customBackgroundFullPath)) {
                        fs.unlinkSync(customBackgroundFullPath);
                        logger.info(`Удален файл фона для пользователя ${value}: ${customBackgroundFullPath}`);
                    }
                } catch (fileError) {
                    logger.error(`Ошибка при удалении файла фона: ${fileError}`);
                }
            }
    
            logger.info(`Удален конфиг ${key} ${value}`);
    
            const embed = createSuccessEmbed(`Конфиг **${key}** **${value}** успешно удален`, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка удаления конфига:", error);
    
            const embed = createErrorEmbed("Ошибка при удалении конфига", interaction.user);
            await interaction.reply({ embeds: [embed] });
        }
    }

    @Slash({ description: "Получить все значения конфига" })
    @Guard(RequireRoles(["high_mod_level", "medium_mod_level"]))
    async get(
        interaction: CommandInteraction
    ) {
        try {
            const configRepository = AppDataSource.getRepository(Config);
            const allConfigs = await configRepository.find();
            if (!allConfigs.length) {
                const embed = createErrorEmbed("Конфиги не найдены", interaction.user);
                return interaction.reply({ embeds: [embed] });
            }

            const configsByKey = this.groupConfigsByKey(allConfigs);
            const embed = createEmbed({
                title: "⚙️ Конфигурация сервера",
                description: "Текущие настройки сервера",
                color: EmbedColors.INFO,
                timestamp: true,
                footer: {
                    text: `Запросил ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL()
                },
                fields: this.createConfigFields(configsByKey)
            });

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        } catch (error) {
            logger.error("Ошибка получения конфига:", error);

            const embed = createErrorEmbed("Ошибка при получении конфига", interaction.user);
            await interaction.reply({ embeds: [embed] });
        }
    }

    private groupConfigsByKey(configs: Config[]): Record<string, string[]> {
        const grouped: Record<string, string[]> = {};

        for (const config of configs) {
            if (!grouped[config.key]) {
                grouped[config.key] = [];
            }
            grouped[config.key].push(config.value);
        }

        return grouped;
    }

    private createConfigFields(configsByKey: Record<string, string[]>): Array<{ name: string, value: string }> {
        const fields: Array<{ name: string, value: string }> = [];
    
        for (const [key, values] of Object.entries(configsByKey)) {
            let displayName = key;
    
            switch (key) {
                case "low_mod_level":
                    displayName = "🟢 Low Mod Roles";
                    break;
                case "medium_mod_level":
                    displayName = "🟠 Medium Mod Roles";
                    break;
                case "high_mod_level":
                    displayName = "🔴 High Mod Roles";
                    break;
                case "ignore_voice_channel_exp":
                    displayName = "🔇 Ignored Voice Channels";
                    break;
                case "user_commands_channel":
                    displayName = "💬 User Commands Channels";
                    break;
                case "custom_background":
                    displayName = "🖼️ Custom Profile Backgrounds";
                    break;
                case "gallery_chat":
                    displayName = "🖼️ Gallery chat";
                    break;
                case "log_chat":
                    displayName = "💬 Log chat";
                    break;
                case "give_role_chat":
                    displayName = "💬 Chat for giving roles";
                    break;
                case "give_role_id":
                    displayName = "💬 IDs for giving roles";
                    break;
                case "role_description":
                    displayName = "📝 Role Descriptions";
                    break;
            }
    
            if (key === "role_description") {
                fields.push({
                    name: displayName,
                    value: values.map(v => {
                        const [roleId, ...descParts] = v.split(":");
                        const desc = descParts.join(":");
                        return `\`${roleId}\`: ${desc}`;
                    }).join("\n")
                });
            } else {
                fields.push({
                    name: displayName,
                    value: values.map(v => `\`${v}\``).join(", ")
                });
            }
        }
    
        return fields;
    }
}