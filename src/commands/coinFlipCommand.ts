import { Discord, Slash, SlashOption, Guard, SlashChoice } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Currency } from "../entities/Currency.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed, createCoinflipEmbed } from "../utils/embedBuilder.js";
import { CheckMoney } from "../utils/decorators/CheckMoney.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import logger from "../services/logger.js";

@Discord()
class CoinflipCommand {
    @Slash({ description: "Подкинуть монетку" })
    @Guard(
        ChannelGuard("user_commands_channel"),
        CheckMoney(),
        Cooldown({ seconds: 10 })
    )
    @EnsureUser()
    async coin(
        @SlashChoice({ name: "Орел", value: "eagle" })
        @SlashChoice({ name: "Решка", value: "reshka" })
        @SlashOption({
            name: "side",
            description: "Выберите сторону",
            type: ApplicationCommandOptionType.String,
            required: true
        })
        side: string,
        @SlashOption({
            name: "bet",
            description: "Сумма ставки",
            minValue: 50,
            maxValue: 500,
            type: ApplicationCommandOptionType.Number,
            required: true
        })
        bet: number,
        interaction: CommandInteraction
    ) {
        try {
            const userRepository = AppDataSource.getRepository(User);
            const currencyRepository = AppDataSource.getRepository(Currency);

            const user = await userRepository.findOne({
                where: { discordId: interaction.user.id },
                relations: ["currency"]
            });

            if (!user || !user.currency) {
                throw new Error("User not found");
            }

            const sides = ["eagle", "reshka"];
            const botSide = sides[Math.floor(Math.random() * sides.length)];
            const isWin = botSide === side;

            const embed = createCoinflipEmbed(
                bet,
                interaction.user,
                side,
                isWin ? Math.floor(bet * 1.93) : 0,
                isWin ? 1 : 0,
                botSide
            );

            if (isWin) {
                user.currency.currencyCount += BigInt(Math.floor(bet * 1.93));
            } else {
                user.currency.currencyCount -= BigInt(bet);
            }

            await currencyRepository.save(user.currency);
            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            logger.error("Ошибка в команде coinflip:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка", interaction.user);
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

export default CoinflipCommand;