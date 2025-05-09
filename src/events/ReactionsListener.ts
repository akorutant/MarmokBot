import { Discord, On, ArgsOf } from "discordx";
import { Client, Message, TextChannel } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import logger from "../services/logger.js";

@Discord()
export class ReactionsListener {
    @On({ event: "messageCreate" })
    async onMessageCreate([message]: ArgsOf<"messageCreate">) {
        try {
            if (message.author.bot) return;

            const configRepository = AppDataSource.getRepository(Config);
            const galleryConfig = await configRepository.findOne({
                where: { key: "gallery_chat" }
            });

            if (!galleryConfig || !galleryConfig.value) {
                logger.warn("Конфиг gallery_chat не найден");
                return;
            }

            if (message.channelId !== galleryConfig.value) return;

            const hasImage = message.attachments.some(attachment =>
                attachment.contentType?.startsWith("image/") ||
                attachment.contentType?.startsWith("video/")
            );

            if (hasImage) {
                await Promise.all(
                    ["👍", "👎"].map(emoji => message.react(emoji))
                );
                logger.info(`Добавлены реакции к изображению от ${message.author.tag}`);
            }
        } catch (error) {
            logger.error("Ошибка в ReactionsListener:", error);
        }
    }
}