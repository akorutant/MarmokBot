import { Discord, Slash, Guard } from "discordx";
import { CommandInteraction } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";

const currentDate = Math.floor(new Date().getTime() / 1000);

@Discord()
class DailyCommand {
    @Slash({ description: "Получить ежедневную награду" })
    @EnsureUser()
    @Guard(
        Cooldown({days: 1}),
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard()
    )
    async daily(
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            const discordUser = interaction.user;
            const currencyRepository = AppDataSource.getRepository(Currency);
            const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });

            await currencyRepository.increment(
                { id: dbUser.currency.id }, 
                "currencyCount", 
                100
            );

            logger.info(`Пользователь ${discordUser.id} получил ежедневную награду`);
            
            await interaction.editReply("Вы получили ежедневную награду в размере 100$");
        } catch (error) {
            logger.error("Ошибка в команде daily:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при выдаче награды", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}

export default DailyCommand;