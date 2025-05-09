import { Discord, On, ArgsOf } from "discordx";
import {
    Message,
    MessageType,
    PartialMessage,
    TextChannel as DiscordTextChannel,
} from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import logger from "../services/logger.js";
import {
    createDeletedMessageLogEmbed,
    createEditedMessageLogEmbed,
    createContentPartEmbed
} from "../utils/embedBuilder.js";

const MESSAGE_CHAR_LIMIT = 2000;

@Discord()
export class LogsListener {
    @On({ event: "messageDelete" })
    async onMessageDelete([rawMessage]: ArgsOf<"messageDelete">) {
        try {
            let message = rawMessage as Message | PartialMessage;
            if (message.partial) {
                message = await message.fetch();
            }

            if (message.author?.bot) return;

            const configRepository = AppDataSource.getRepository(Config);
            const logConfig = await configRepository.findOne({ where: { key: "log_chat" } });
            if (!logConfig?.value) {
                logger.warn("Конфиг log_chat не найден");
                return;
            }

            const logChannel = message.client.channels.cache.get(logConfig.value) as DiscordTextChannel;
            if (!logChannel) {
                logger.warn(`Канал логов с ID ${logConfig.value} не найден`);
                return;
            }

            const embed = createDeletedMessageLogEmbed(message);

            if (message.content) {
                const contentChunks = this.splitMessage(message.content);

                if (contentChunks.length === 1) {
                    embed.addFields({ name: "Содержимое", value: contentChunks[0] });
                    await logChannel.send({ embeds: [embed] });
                } else {
                    embed.addFields({ name: "Содержимое (часть 1)", value: contentChunks[0] });
                    await logChannel.send({ embeds: [embed] });

                    for (let i = 1; i < contentChunks.length; i++) {
                        const followUpEmbed = createContentPartEmbed(
                            `Содержимое удаленного сообщения (часть ${i + 1})`,
                            contentChunks[i],
                            "#FF0000"
                        );
                        await logChannel.send({ embeds: [followUpEmbed] });
                    }
                }
            } else {
                await logChannel.send({ embeds: [embed] });
            }

            logger.info(`Залогировано удаленное сообщение от ${message.author?.tag} в канале ${message.channelId}`);
        } catch (error) {
            logger.error("Ошибка в LogsListener (onMessageDelete):", error);
        }
    }

    @On({ event: "messageUpdate" })
    async onMessageUpdate([rawOld, rawNew]: ArgsOf<"messageUpdate">) {
        try {
            let oldMessage = rawOld as Message | PartialMessage;
            let newMessage = rawNew as Message | PartialMessage;

            if (oldMessage.partial) {
                oldMessage = await oldMessage.fetch();
            }
            if (newMessage.partial) {
                newMessage = await newMessage.fetch();
            }

            if (newMessage.author?.bot || newMessage.type === MessageType.ChannelPinnedMessage) return;
            if (oldMessage.content === newMessage.content) return;

            const configRepository = AppDataSource.getRepository(Config);
            const logConfig = await configRepository.findOne({ where: { key: "log_chat" } });
            if (!logConfig?.value) {
                logger.warn("Конфиг log_chat не найден");
                return;
            }

            const logChannel = newMessage.client.channels.cache.get(logConfig.value) as DiscordTextChannel;
            if (!logChannel) {
                logger.warn(`Канал логов с ID ${logConfig.value} не найден`);
                return;
            }

            const embed = createEditedMessageLogEmbed(oldMessage, newMessage, "Сообщение отредактировано");

            if (oldMessage.content) {
                const oldChunks = this.splitMessage(oldMessage.content);

                if (oldChunks.length === 1) {
                    embed.addFields({ name: "Старое содержимое", value: oldChunks[0] });
                } else {
                    embed.addFields({ name: "Старое содержимое (часть 1)", value: oldChunks[0] });
                    await logChannel.send({ embeds: [embed] });

                    for (let i = 1; i < oldChunks.length; i++) {
                        const partEmbed = createContentPartEmbed(
                            `Старое содержимое (часть ${i + 1})`,
                            oldChunks[i]
                        );
                        await logChannel.send({ embeds: [partEmbed] });
                    }

                    if (newMessage.content) {
                        const newChunks = this.splitMessage(newMessage.content);
                        for (let i = 0; i < newChunks.length; i++) {
                            const newPartEmbed = createContentPartEmbed(
                                `Новое содержимое (часть ${i + 1})`,
                                newChunks[i]
                            );
                            await logChannel.send({ embeds: [newPartEmbed] });
                        }
                    }

                    logger.info(`Залогировано отредактированное сообщение от ${newMessage.author?.tag} в канале ${newMessage.channelId}`);
                    return;
                }
            }

            if (newMessage.content) {
                const newChunks = this.splitMessage(newMessage.content);
                if (newChunks.length === 1) {
                    embed.addFields({ name: "Новое содержимое", value: newChunks[0] });
                    await logChannel.send({ embeds: [embed] });
                } else {
                    embed.addFields({ name: "Новое содержимое (часть 1)", value: newChunks[0] });
                    await logChannel.send({ embeds: [embed] });

                    for (let i = 1; i < newChunks.length; i++) {
                        const followUp = createContentPartEmbed(
                            `Новое содержимое (часть ${i + 1})`,
                            newChunks[i]
                        );
                        await logChannel.send({ embeds: [followUp] });
                    }
                }
            } else {
                await logChannel.send({ embeds: [embed] });
            }

            logger.info(`Залогировано отредактированное сообщение от ${newMessage.author?.tag} в канале ${newMessage.channelId}`);
        } catch (error) {
            logger.error("Ошибка в LogsListener (onMessageUpdate):", error);
        }
    }

    /**
     * Делит сообщение на части с учетом лимита символов Discord
     * @param text Текст для разделения
     * @returns Массив частей сообщения
     */
    private splitMessage(text: string): string[] {
        if (text.length <= MESSAGE_CHAR_LIMIT) {
            return [text];
        }
        const chunks: string[] = [];
        let current = "";
        for (const line of text.split("\n")) {
            if (current.length + line.length + 1 > MESSAGE_CHAR_LIMIT) {
                if (line.length > MESSAGE_CHAR_LIMIT) {
                    if (current) chunks.push(current);
                    current = "";
                    let pos = 0;
                    while (pos < line.length) {
                        chunks.push(line.slice(pos, pos + MESSAGE_CHAR_LIMIT));
                        pos += MESSAGE_CHAR_LIMIT;
                    }
                } else {
                    chunks.push(current);
                    current = line;
                }
            } else {
                current += (current ? "\n" : "") + line;
            }
        }
        if (current) chunks.push(current);
        return chunks;
    }
}