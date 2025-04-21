import { Discord, On, ArgsOf } from "discordx";
import { 
    TextChannel, 
    EmbedBuilder, 
    ColorResolvable,
    MessageType
} from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import logger from "../services/logger.js";

@Discord()
export class LogsListener {
    private readonly MESSAGE_CHAR_LIMIT = 2000;

    @On({ event: "messageDelete" })
    async onMessageDelete([message]: ArgsOf<"messageDelete">) {
        try {
            if (message.author?.bot) return;
            
            const configRepository = AppDataSource.getRepository(Config);
            const logConfig = await configRepository.findOne({
                where: { key: "log_chat" }
            });
            
            if (!logConfig || !logConfig.value) {
                logger.warn("Конфиг log_chat не найден");
                return;
            }
            
            const logChannel = message.client.channels.cache.get(logConfig.value) as TextChannel;
            if (!logChannel) {
                logger.warn(`Канал логов с ID ${logConfig.value} не найден`);
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle("Сообщение удалено")
                .setColor("#FF0000" as ColorResolvable)
                .setTimestamp()
                .addFields(
                    { name: "Автор", value: `${message.author?.tag} (${message.author?.id})`, inline: true },
                    { name: "Канал", value: `<#${message.channelId}> (${message.channelId})`, inline: true },
                    { name: "ID сообщения", value: message.id, inline: true }
                );
            
            if (message.attachments.size > 0) {
                const attachmentsList = message.attachments.map(a => `[${a.name}](${a.url})`).join("\n");
                embed.addFields({ name: "Вложения", value: attachmentsList });
            }
            
            if (message.content) {
                const contentChunks = this.splitMessage(message.content);
                
                if (contentChunks.length === 1) {
                    embed.addFields({ name: "Содержимое", value: contentChunks[0] });
                    await logChannel.send({ embeds: [embed] });
                } else {
                    embed.addFields({ name: "Содержимое (часть 1)", value: contentChunks[0] });
                    await logChannel.send({ embeds: [embed] });
                    
                    for (let i = 1; i < contentChunks.length; i++) {
                        const followUpEmbed = new EmbedBuilder()
                            .setTitle(`Содержимое удаленного сообщения (часть ${i + 1})`)
                            .setColor("#FF0000" as ColorResolvable)
                            .setDescription(contentChunks[i]);
                        
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
    async onMessageUpdate([oldMessage, newMessage]: ArgsOf<"messageUpdate">) {
        try {
            if (newMessage.author?.bot || 
                newMessage.type === MessageType.ChannelPinnedMessage) return;
            
            if (oldMessage.content === newMessage.content) return;
            
            const configRepository = AppDataSource.getRepository(Config);
            const logConfig = await configRepository.findOne({
                where: { key: "log_chat" }
            });
            
            if (!logConfig || !logConfig.value) {
                logger.warn("Конфиг log_chat не найден");
                return;
            }
            
            const logChannel = newMessage.client.channels.cache.get(logConfig.value) as TextChannel;
            if (!logChannel) {
                logger.warn(`Канал логов с ID ${logConfig.value} не найден`);
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle("Сообщение отредактировано")
                .setColor("#FFA500" as ColorResolvable)
                .setTimestamp()
                .addFields(
                    { name: "Автор", value: `${newMessage.author?.tag} (${newMessage.author?.id})`, inline: true },
                    { name: "Канал", value: `<#${newMessage.channelId}> (${newMessage.channelId})`, inline: true },
                    { name: "ID сообщения", value: newMessage.id, inline: true },
                    { name: "Ссылка", value: `[Перейти к сообщению](${newMessage.url})`, inline: true }
                );
            
            if (oldMessage.content) {
                const oldContentChunks = this.splitMessage(oldMessage.content);
                
                if (oldContentChunks.length === 1) {
                    embed.addFields({ name: "Старое содержимое", value: oldContentChunks[0] });
                } else {
                    embed.addFields({ name: "Старое содержимое (часть 1)", value: oldContentChunks[0] });
                    
                    const oldContentEmbeds = oldContentChunks.slice(1).map((chunk, index) => {
                        return new EmbedBuilder()
                            .setTitle(`Старое содержимое (часть ${index + 2})`)
                            .setColor("#FFA500" as ColorResolvable)
                            .setDescription(chunk);
                    });
                    
                    await logChannel.send({ embeds: [embed] });
                    
                    for (const embedToSend of oldContentEmbeds) {
                        await logChannel.send({ embeds: [embedToSend] });
                    }
                    
                    if (newMessage.content) {
                        const newContentChunks = this.splitMessage(newMessage.content);
                        
                        for (let i = 0; i < newContentChunks.length; i++) {
                            const newContentEmbed = new EmbedBuilder()
                                .setTitle(`Новое содержимое (часть ${i + 1})`)
                                .setColor("#FFA500" as ColorResolvable)
                                .setDescription(newContentChunks[i]);
                            
                            await logChannel.send({ embeds: [newContentEmbed] });
                        }
                    }
                    
                    logger.info(`Залогировано отредактированное сообщение от ${newMessage.author?.tag} в канале ${newMessage.channelId}`);
                    return;
                }
            }
            
            if (newMessage.content) {
                const newContentChunks = this.splitMessage(newMessage.content);
                
                if (newContentChunks.length === 1) {
                    embed.addFields({ name: "Новое содержимое", value: newContentChunks[0] });
                    await logChannel.send({ embeds: [embed] });
                } else {
                    embed.addFields({ name: "Новое содержимое (часть 1)", value: newContentChunks[0] });
                    await logChannel.send({ embeds: [embed] });
                    
                    for (let i = 1; i < newContentChunks.length; i++) {
                        const followUpEmbed = new EmbedBuilder()
                            .setTitle(`Новое содержимое (часть ${i + 1})`)
                            .setColor("#FFA500" as ColorResolvable)
                            .setDescription(newContentChunks[i]);
                        
                        await logChannel.send({ embeds: [followUpEmbed] });
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
        if (text.length <= this.MESSAGE_CHAR_LIMIT) {
            return [text];
        }
        
        const chunks: string[] = [];
        let currentChunk = "";
        
        const lines = text.split("\n");
        
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 > this.MESSAGE_CHAR_LIMIT) {
                if (line.length > this.MESSAGE_CHAR_LIMIT) {
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                        currentChunk = "";
                    }
                    
                    let pos = 0;
                    while (pos < line.length) {
                        const subline = line.substring(pos, pos + this.MESSAGE_CHAR_LIMIT);
                        chunks.push(subline);
                        pos += this.MESSAGE_CHAR_LIMIT;
                    }
                } else {
                    chunks.push(currentChunk);
                    currentChunk = line;
                }
            } else {
                if (currentChunk.length > 0) {
                    currentChunk += "\n";
                }
                currentChunk += line;
            }
        }
        
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }
}

export default LogsListener;