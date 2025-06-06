import { GuardFunction } from "discordx";
import { CommandInteraction, ButtonInteraction, BaseInteraction } from "discord.js";
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

export function Cooldown(options: CooldownOptions | number): GuardFunction<BaseInteraction> {
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

        // Определяем идентификатор в зависимости от типа взаимодействия
        const identifier = interaction.isCommand()
            ? `cmd_${interaction.commandName}`
            : interaction.isButton()
                ? `btn_${interaction.customId}`
                : null;

        if (!identifier) {
            await next();
            return;
        }

        const userId = interaction.user.id;

        const cooldownRepository = AppDataSource.getRepository(CommandCooldown);

        try {
            const cooldown = await cooldownRepository.findOne({
                where: { userId, commandName: identifier }
            });

            const now = new Date();
            const lastUsed = cooldown?.lastUsed || new Date(0);
            const elapsedSeconds = (now.getTime() - lastUsed.getTime()) / 1000;

            if (elapsedSeconds < totalSeconds) {
                const remaining = totalSeconds - elapsedSeconds;
                const timeString = formatTime(remaining);

                const defaultMessage = `⏳ Действие на кулдауне. Попробуйте через ${timeString}`;
                const customMessage = typeof options === "object" ? options.message : undefined;

                if (interaction.isRepliable()) {
                    await interaction.reply({
                        content: customMessage
                            ? customMessage.replace("{time}", timeString)
                            : defaultMessage,
                        ephemeral: true
                    });
                }
                return;
            }

            await next();

            await cooldownRepository.save({
                userId,
                commandName: identifier,
                lastUsed: now
            });

        } catch (error) {
            logger.error("Cooldown check failed:", error);
            try {
                if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "❌ Ошибка проверки кулдауна",
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                logger.error("Failed to send error response:", replyError);
            }
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