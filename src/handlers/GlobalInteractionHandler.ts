import { Discord, On } from "discordx";
import { Interaction, Events } from "discord.js";
import logger from "../services/logger.js";
import { safeErrorReply } from "../utils/interactionUtils.js";

@Discord()
export class GlobalInteractionHandler {
    private static readonly IGNORED_ERROR_CODES = [
        10062, // Unknown interaction
        40060, // Interaction has already been acknowledged
    ];

    @On({ event: Events.InteractionCreate })
    async onInteraction(interaction: Interaction): Promise<void> {
        if (!interaction.isCommand()) return;

        // Добавляем глобальный timeout для всех команд
        const globalTimeout = setTimeout(async () => {
            if (!interaction.replied && !interaction.deferred) {
                logger.warn(`Global timeout for command: ${interaction.commandName}`);
                await safeErrorReply(
                    interaction, 
                    "⏱️ Команда выполняется слишком долго. Попробуйте позже."
                );
            }
        }, 29000); // 29 секунд - почти лимит Discord

        // Очищаем timeout при завершении взаимодействия
        const originalReply = interaction.reply.bind(interaction);
        const originalEditReply = interaction.editReply.bind(interaction);
        const originalDeferReply = interaction.deferReply.bind(interaction);

        interaction.reply = ((...args) => {
            clearTimeout(globalTimeout);
            return originalReply(...args);
        }) as typeof interaction.reply;

        interaction.editReply = ((...args) => {
            clearTimeout(globalTimeout);
            return originalEditReply(...args);
        }) as typeof interaction.editReply;

        interaction.deferReply = ((...args) => {
            // Не очищаем timeout для defer, так как нужно будет editReply
            return originalDeferReply(...args);
        }) as typeof interaction.deferReply;
    }

    @On({ event: Events.Error })
    async onError(error: Error): Promise<void> {
        // Проверяем, является ли это ошибкой взаимодействия
        if (this.isDiscordAPIError(error)) {
            const apiError = error as any;
            
            // Игнорируем известные безопасные ошибки
            if (GlobalInteractionHandler.IGNORED_ERROR_CODES.includes(apiError.code)) {
                logger.debug(`Ignored Discord API error ${apiError.code}: ${apiError.message}`);
                return;
            }
        }

        logger.error("Global error handler:", error);
    }

    private isDiscordAPIError(error: Error): boolean {
        return error.name === 'DiscordAPIError' || 
               (error as any).code !== undefined;
    }
}

// Добавляем middleware для логирования состояния interactions
export function logInteractionState(interaction: Interaction, context: string): void {
    if (!interaction.isCommand()) return;
    
    logger.debug(`${context} - Interaction state:`, {
        commandName: interaction.commandName,
        replied: interaction.replied,
        deferred: interaction.deferred,
        user: interaction.user.tag,
        channelId: interaction.channelId
    });
}