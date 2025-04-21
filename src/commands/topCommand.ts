import { Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { ApplicationCommandOptionType, CommandInteraction } from "discord.js";
import { createTopEmbed, createErrorEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { AppDataSource } from "../services/database.js";
import { Currency } from "../entities/Currency.js";
import { User } from "../entities/User.js";

@Discord()
class TopCommand {
    @Slash({ description: "Показать топ пользователей" })
    @Guard(
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard()
    )
    async top(
        @SlashChoice("Валюта", "currency")
        @SlashChoice("Голосовой", "voice")
        @SlashOption({
            description: "Тип топа",
            name: "type",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        topType: string,
        @SlashOption({
            description: "Количество пользователей для отображения",
            name: "limit",
            required: false,
            type: ApplicationCommandOptionType.Number
        })
        limit: number = 10,
        interaction: CommandInteraction,
    ) {
        try {
            if (limit <= 0 || limit > 25) limit = 10;
    
            if (topType === "voice") {
                const userRepository = AppDataSource.getRepository(User);
                const topUsers = await userRepository
                    .createQueryBuilder("user")
                    .orderBy("user.voiceMinutes", "DESC")
                    .take(limit)
                    .getMany();
    
                if (topUsers.length === 0) {
                    const embed = createErrorEmbed("На сервере пока нет данных о голосовой активности!", interaction.user);
                    return interaction.reply({ embeds: [embed] });
                }
    
                const embed = createTopEmbed(
                    topUsers.map((u) => ({ user: u, value: u.voiceMinutes })),
                    limit,
                    interaction.user,
                    interaction.guild,
                    {
                        title: `🎙️ Топ ${limit} по голосовой активности`,
                        description: "Пользователи, которые больше всех сидели в голосе",
                        icon: "🕐",
                        color: EmbedColors.INFO
                    }
                );
    
                return interaction.reply({ embeds: [embed] });
            }
    
            const currencyRepository = AppDataSource.getRepository(Currency);
            const topUsers = await currencyRepository
                .createQueryBuilder("currency")
                .leftJoinAndSelect("currency.user", "user")
                .orderBy("currency.currencyCount", "DESC")
                .take(limit)
                .getMany();
    
            if (topUsers.length === 0) {
                const embed = createErrorEmbed("На сервере пока нет пользователей с валютой!", interaction.user);
                return interaction.reply({ embeds: [embed] });
            }
    
            const embed = createTopEmbed(
                topUsers.map((c) => ({ user: c.user, value: c.currencyCount })),
                limit,
                interaction.user,
                interaction.guild,
                {
                    title: `💰 Топ ${limit} по валюте`,
                    description: "Самые богатые пользователи сервера",
                    icon: "💰",
                    color: EmbedColors.CURRENCY
                }
            );
    
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при получении топа пользователей: %O", error);
        }
    }
    
}

export default TopCommand;