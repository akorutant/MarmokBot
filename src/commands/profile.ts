import { Discord, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, User, ApplicationCommandOptionType } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createProfileEmbed, createErrorEmbed } from "../utils/embedBuilder.js";
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
            const targetUser = user || interaction.user;
            const userRepository = AppDataSource.getRepository(DBUser);
            
            const dbUser = await userRepository.findOne({
                where: { discordId: targetUser.id },
                relations: ["exp", "currency"]
            });
            
            const messageCount = dbUser?.messageCount ?? BigInt(0);
            const voiceMinutes = dbUser?.voiceMinutes ?? BigInt(0);
            const expValue = dbUser?.exp?.exp ?? BigInt(0);
            const levelValue = dbUser?.exp?.level ?? 1;
            const currencyValue = dbUser?.currency?.currencyCount ?? BigInt(0);
            
            const embed = createProfileEmbed(
                targetUser,
                messageCount,
                voiceMinutes,
                expValue,
                levelValue,
                currencyValue,
                interaction.user
            );
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка в команде profile:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при получении данных", interaction.user);
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

export default ProfileCommand;