import { CommandInteraction, InteractionResponse, MessageFlags } from "discord.js";
import logger from "../services/logger.js";

/**
 * Безопасно отвечает на interaction, проверяя его состояние
 */
export async function safeReply(
  interaction: CommandInteraction,
  options: Parameters<CommandInteraction['reply']>[0]
): Promise<InteractionResponse | null> {
  try {
    if (!interaction) {
      logger.error("safeReply: Invalid interaction");
      return null;
    }

    if (interaction.replied) {
      logger.warn("safeReply: Interaction already replied");
      return null;
    }

    if (interaction.deferred) {
      logger.warn("safeReply: Interaction was deferred, using editReply");
      try {
        await interaction.editReply(options);
        return null; // editReply doesn't return InteractionResponse
      } catch (editError) {
        logger.error("safeReply: Failed to edit deferred reply:", editError);
        return null;
      }
    }

    return await interaction.reply(options);
  } catch (error) {
    logger.error("safeReply: Failed to reply to interaction:", error);
    return null;
  }
}

/**
 * Безопасно делает defer на interaction
 */
export async function safeDefer(
  interaction: CommandInteraction,
  ephemeral = false
): Promise<boolean> {
  try {
    if (!interaction) {
      logger.error("safeDefer: Invalid interaction");
      return false;
    }

    if (interaction.replied || interaction.deferred) {
      logger.warn("safeDefer: Interaction already handled");
      return false;
    }

    await interaction.deferReply({ ephemeral });
    return true;
  } catch (error) {
    logger.error("safeDefer: Failed to defer interaction:", error);
    return false;
  }
}

/**
 * Безопасно редактирует ответ на interaction
 */
export async function safeEditReply(
  interaction: CommandInteraction,
  options: Parameters<CommandInteraction['editReply']>[0]
): Promise<boolean> {
  try {
    if (!interaction) {
      logger.error("safeEditReply: Invalid interaction");
      return false;
    }

    if (!interaction.deferred && !interaction.replied) {
      logger.error("safeEditReply: Interaction not deferred or replied");
      return false;
    }

    await interaction.editReply(options);
    return true;
  } catch (error) {
    logger.error("safeEditReply: Failed to edit reply:", error);
    return false;
  }
}

/**
 * Проверяет, можно ли отвечать на interaction
 */
export function canRespond(interaction: CommandInteraction): boolean {
  return !!(interaction && !interaction.replied && !interaction.deferred);
}

/**
 * Проверяет, можно ли редактировать ответ на interaction
 */
export function canEdit(interaction: CommandInteraction): boolean {
  return !!(interaction && (interaction.deferred || interaction.replied));
}

/**
 * Безопасно отправляет ошибку пользователю
 */
export async function safeErrorReply(
  interaction: CommandInteraction,
  message: string,
  ephemeral = true
): Promise<boolean> {
  const errorOptions = {
    content: `❌ ${message}`,
    flags: ephemeral ? MessageFlags.Ephemeral : undefined,
  };

  if (canRespond(interaction)) {
    const result = await safeReply(interaction, errorOptions);
    return result !== null;
  } else if (canEdit(interaction)) {
    return await safeEditReply(interaction, errorOptions);
  }

  logger.warn("safeErrorReply: Cannot respond to interaction");
  return false;
}

/**
 * Создает timeout protection для interaction
 */
export function createInteractionTimeout(
  interaction: CommandInteraction,
  timeoutMs = 14000, // 14 секунд до истечения 15-секундного лимита Discord
  timeoutMessage = "⏱️ Время выполнения команды истекло"
): NodeJS.Timeout {
  return setTimeout(async () => {
    if (canRespond(interaction)) {
      await safeErrorReply(interaction, timeoutMessage);
    }
  }, timeoutMs);
}