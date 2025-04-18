import { Discord, SlashGroup, Slash, SlashOption, SlashChoice } from "discordx";
import { CommandInteraction } from "discord.js";
import { ApplicationCommandOptionType } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { createSuccessEmbed, createErrorEmbed, createEmbed, EmbedColors } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";


@Discord()
@SlashGroup({ description: "Commands for managing server config", name: "config" })
@SlashGroup("config")
class ConfigCommands {
    @Slash({ description: "Add config value" })
    @RequireRoles(["high_mod_level", "medium_mod_level"])
    async add(
        @SlashChoice({ name: "Low Moderation Level", value: "low_mod_level" })
        @SlashChoice({ name: "Medium Moderation Level", value: "medium_mod_level" })
        @SlashChoice({ name: "High Moderation Level", value: "high_mod_level" })
        @SlashChoice({ name: "Ignore Voice Channel For EXP", value: "ignore_voice_channel_exp" })
        @SlashChoice({ name: "Allow chat commands for users ", value: "user_commands_channel" })
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

    @Slash({ description: "Remove config value" })
    @RequireRoles(["high_mod_level", "medium_mod_level"])
    async remove(
        @SlashChoice({ name: "Low Moderation Level", value: "low_mod_level" })
        @SlashChoice({ name: "Medium Moderation Level", value: "medium_mod_level" })
        @SlashChoice({ name: "High Moderation Level", value: "high_mod_level" })
        @SlashChoice({ name: "Ignore Voice Channel For EXP", value: "ignore_voice_channel_exp" })
        @SlashChoice({ name: "Allow chat commands for users ", value: "user_commands_channel" })
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
            const result = await configRepository.delete({ key, value });

            if (result.affected === 0) {
                const embed = createErrorEmbed(`Конфиг **${key}** **${value}** не найден`, interaction.user);
                return interaction.reply({ embeds: [embed] });
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

    @Slash({ description: "Get config value" })
    @RequireRoles(["high_mod_level", "medium_mod_level"])
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
            }

            fields.push({
                name: displayName,
                value: values.map(v => `\`${v}\``).join(", ")
            });
        }

        return fields;
    }
}