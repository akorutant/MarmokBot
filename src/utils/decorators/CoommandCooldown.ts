import { GuardFunction } from "discordx";
import { CommandInteraction } from "discord.js";
import { AppDataSource } from "../../services/database.js";
import { CommandCooldown } from "../../entities/CommandCooldown.js";
import logger from "../../services/logger.js";

interface CooldownOptions {
    seconds?: number;
    minutes?: number;
    hours?: number;
    days?: number;
    message?: string;
}

export function Cooldown(options: CooldownOptions | number): GuardFunction<CommandInteraction> {
    return async (interaction, _, next) => {
        let totalSeconds = 0;

        if (typeof options === "number") {
            totalSeconds = options;
        } else {
            totalSeconds =
                (options.seconds || 0) +
                (options.minutes || 0) * 60 +
                (options.hours || 0) * 3600 +
                (options.days || 0) * 86400;
        }

        const commandName = interaction.commandName;
        const userId = interaction.user.id;

        const cooldownRepository = AppDataSource.getRepository(CommandCooldown);

        try {
            const cooldown = await cooldownRepository.findOne({
                where: { userId, commandName }
            });

            const now = new Date();
            const lastUsed = cooldown?.lastUsed || new Date(0);
            const elapsedSeconds = (now.getTime() - lastUsed.getTime()) / 1000;

            if (elapsedSeconds < totalSeconds) {
                const remaining = totalSeconds - elapsedSeconds;
                const timeString = formatTime(remaining);

                const defaultMessage = `⏳ Эта команда на кулдауне. Попробуйте через ${timeString}`;
                const customMessage = typeof options === "object" ? options.message : undefined;

                await interaction.reply({
                    content: customMessage
                        ? customMessage.replace("{time}", timeString)
                        : defaultMessage,
                    ephemeral: true
                });
                return;
            }

            await next();

            await cooldownRepository.save({
                userId,
                commandName,
                lastUsed: now
            });

        } catch (error) {
            logger.error(`Cooldown error for ${commandName}:`, error);
            await interaction.reply({
                content: "❌ Произошла ошибка при проверке кулдауна",
                ephemeral: true
            });
        }
    };
}

function formatTime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days} д.`);
    if (hours > 0) parts.push(`${hours} ч.`);
    if (minutes > 0) parts.push(`${minutes} мин.`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds} сек.`);

    return parts.join(" ");
}