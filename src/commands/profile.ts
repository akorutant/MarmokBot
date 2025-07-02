import { Discord, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, User, ApplicationCommandOptionType, AttachmentBuilder } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed } from "../utils/embedBuilder.js";
import {
    calculateNextLevelExp,
    getMaxLevelForExp,
    isMaxLevel
} from "../utils/levelUpUtils.js";
import { generateProfileImage } from "../utils/profileImageGenerator.js";
import logger from "../services/logger.js";
import { Config } from "../entities/Config.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { 
  safeDefer, 
  safeEditReply, 
  safeErrorReply, 
  canRespond, 
  createInteractionTimeout 
} from "../utils/interactionUtils.js";

@Discord()
class ProfileCommand {
    @Slash({ description: "Показать профиль пользователя" })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard()
    )
    async profile(
        @SlashOption({
            name: "user",
            description: "Пользователь для просмотра профиля",
            type: ApplicationCommandOptionType.User,
            required: false
        })
        user: User | undefined,
        interaction: CommandInteraction
    ) {
        // Создаем timeout protection с увеличенным временем для генерации изображения
        const timeout = createInteractionTimeout(
            interaction, 
            25000, // 25 секунд для генерации изображения
            "⏱️ Генерация профиля заняла слишком много времени"
        );
        
        try {
            // Проверяем, можем ли мы отвечать на interaction
            if (!canRespond(interaction)) {
                logger.warn("Profile command: Cannot respond to interaction");
                clearTimeout(timeout);
                return;
            }

            // Безопасно делаем defer
            const deferred = await safeDefer(interaction);
            if (!deferred) {
                logger.warn("Profile command: Failed to defer interaction");
                clearTimeout(timeout);
                return;
            }

            const targetUser = user ? await interaction.client.users.fetch(user.id) : interaction.user;
            logger.info(`Generating profile for user: ${targetUser.tag} (${targetUser.id})`);

            const userRepository = AppDataSource.getRepository(DBUser);
            const dbUser = await userRepository.findOne({
                where: { discordId: targetUser.id },
                relations: ["exp", "currency"]
            });

            const messageCount = dbUser?.messageCount ?? BigInt(0);
            const voiceMinutes = dbUser?.voiceMinutes ?? BigInt(0);
            const expValue = dbUser?.exp?.exp ?? BigInt(0);
            const currencyValue = dbUser?.currency?.currencyCount ?? BigInt(0);

            let levelValue = dbUser?.exp?.level ?? 1;
            const calculatedLevel = getMaxLevelForExp(expValue);

            if (levelValue !== calculatedLevel && dbUser?.exp) {
                levelValue = calculatedLevel;
                dbUser.exp.level = levelValue;
                await AppDataSource.getRepository(dbUser.exp.constructor).save(dbUser.exp);
                logger.info(`Скорректирован уровень пользователя ${targetUser.id}: ${levelValue}`);
            }

            const nextLevelExp = calculateNextLevelExp(levelValue);
            let progressPercentage = 0;
            if (!isMaxLevel(levelValue)) {
                progressPercentage = Number((Number(expValue) / Number(nextLevelExp) * 100).toFixed(1));
            }

            logger.info(`User stats - Messages: ${messageCount}, Voice: ${voiceMinutes}, Level: ${levelValue}, Progress: ${progressPercentage}%`);

            // Проверка кастомного фона
            let backgroundImagePath = undefined;
            try {
                const configRepo = AppDataSource.getRepository(Config);
                const config = await configRepo.findOne({
                    where: { key: "custom_background", value: targetUser.id }
                });
                
                if (config) {
                    const __filename = fileURLToPath(import.meta.url);
                    const __dirname = path.dirname(__filename);
                    const imagePath = path.join(__dirname, '../../assets/images', `${targetUser.id}.png`);
                    
                    if (fs.existsSync(imagePath)) {
                        backgroundImagePath = imagePath;
                        logger.info(`Применяем кастомный фон для пользователя ${targetUser.id}`);
                    }
                }
            } catch (error) {
                logger.error(`Ошибка при проверке кастомного фона: ${error}`);
            }

            try {
                const profileImage = await generateProfileImage(
                    targetUser,
                    Number(messageCount),
                    Number(voiceMinutes),
                    levelValue,
                    Number(currencyValue),
                    progressPercentage,
                    backgroundImagePath
                );

                const attachment = new AttachmentBuilder(profileImage, { name: 'profile.png' });
                
                // Очищаем timeout перед успешным ответом
                clearTimeout(timeout);
                
                await safeEditReply(interaction, { files: [attachment] });
                logger.info(`Profile image sent successfully for ${targetUser.tag}`);
            } catch (imageError) {
                clearTimeout(timeout);
                logger.error(`Error generating profile image: ${imageError}`);
                
                await safeErrorReply(
                    interaction, 
                    "Произошла ошибка при создании изображения профиля"
                );
            }
        } catch (error) {
            clearTimeout(timeout);
            logger.error(`General error in profile command: ${error}`);
            
            await safeErrorReply(
                interaction, 
                "Произошла ошибка при получении данных"
            );
        }
    }
}

export default ProfileCommand;