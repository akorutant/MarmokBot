import { Discord, Slash, Guard } from "discordx";
import { RateLimit, TIME_UNIT } from "@discordx/utilities"
import { CommandInteraction } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";

const currentDate = Math.floor(new Date().getTime() / 1000);

@Discord()
class DailyCommand {
    @Slash({ description: "Получить ежедневную награду" })
    @Guard(
        RateLimit(TIME_UNIT.days, 1, {
          message: `Вы уже получили ежедневную награду. Приходите через <t:${currentDate + 86400}:R>`,
          rateValue: 1,
        }),
      )
    @Guard(ChannelGuard("user_commands_channel"))
    @EnsureUser()
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