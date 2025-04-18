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
    getProgressToNextLevel,
    isMaxLevel
} from "../utils/levelUpUtils.js";
import { generateProfileImage } from "../utils/profileImageGenerator.js";
import logger from "../services/logger.js";

@Discord()
class ProfileCommand {
    @Slash({ description: "Показать профиль пользователя" })
    @Guard(ChannelGuard("user_commands_channel"))
    @EnsureUser()
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
        try {
            await interaction.deferReply();

            // Get target user
            const targetUser = user ? await interaction.client.users.fetch(user.id) : interaction.user;
            logger.info(`Generating profile for user: ${targetUser.tag} (${targetUser.id})`);

            // Get user data from database
            const userRepository = AppDataSource.getRepository(DBUser);
            const dbUser = await userRepository.findOne({
                where: { discordId: targetUser.id },
                relations: ["exp", "currency"]
            });

            // Extract user stats
            const messageCount = dbUser?.messageCount ?? BigInt(0);
            const voiceMinutes = dbUser?.voiceMinutes ?? BigInt(0);
            const expValue = dbUser?.exp?.exp ?? BigInt(0);
            const currencyValue = dbUser?.currency?.currencyCount ?? BigInt(0);

            // Get or correct level value
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

            // Generate profile image
            try {
                const profileImage = await generateProfileImage(
                    targetUser,
                    Number(messageCount),
                    Number(voiceMinutes),
                    levelValue,
                    Number(currencyValue),
                    progressPercentage
                );

                const attachment = new AttachmentBuilder(profileImage, { name: 'profile.png' });
                await interaction.editReply({ files: [attachment] });
                logger.info(`Profile image sent successfully for ${targetUser.tag}`);
            } catch (imageError) {
                logger.error(`Error generating profile image: ${imageError}`);
                const errorEmbed = createErrorEmbed("Произошла ошибка при создании изображения профиля", interaction.user);
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        } catch (error) {
            logger.error(`General error in profile command: ${error}`);
            const errorEmbed = createErrorEmbed("Произошла ошибка при получении данных", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}

export default ProfileCommand;