import { Discord, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, User, ApplicationCommandOptionType } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { 
  createProfileEmbed, 
  createErrorEmbed 
} from "../utils/embedBuilder.js";
import { 
  getMaxLevelForExp, 
  calculateNextLevelExp, 
  getExpToNextLevel, 
  getProgressToNextLevel, 
  isMaxLevel 
} from "../utils/levelUpUtils.js";
import logger from "../services/logger.js";

@Discord()
class ModProfileCommand {
    @Slash({ description: "Показать профиль пользователя" })
    @RequireRoles(["high_mod_level", "medium_mod_level"])
    @EnsureUser()
    async modprofile(
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
            const targetUser = user ? await interaction.client.users.fetch(user.id) : interaction.user;
            const userRepository = AppDataSource.getRepository(DBUser);
            
            const dbUser = await userRepository.findOne({
                where: { discordId: targetUser.id },
                relations: ["exp", "currency"]
            });

            const messageCount = dbUser?.messageCount ?? BigInt(0);
            const voiceMinutes = dbUser?.voiceMinutes ?? BigInt(0);
            const expValue = dbUser?.exp?.exp ?? BigInt(0);
            
            let levelValue = dbUser?.exp?.level ?? 1;
            const calculatedLevel = getMaxLevelForExp(expValue);
            
            if (levelValue !== calculatedLevel && dbUser?.exp) {
                levelValue = calculatedLevel;
                dbUser.exp.level = levelValue;
                await AppDataSource.getRepository(dbUser.exp.constructor).save(dbUser.exp);
                logger.info(`Скорректирован уровень пользователя ${targetUser.id}: ${levelValue}`);
            }
            
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
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            logger.error("Ошибка в команде profile:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при получении данных", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}

export default ModProfileCommand;
