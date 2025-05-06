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
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";

@Discord()
class CoinflipCommand {
    @Slash({ description: "Подкинуть монетку" })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        CheckMoney(),
        EnsureUserGuard(),
        Cooldown({ minutes: 1 })
    )
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
            maxValue: 250,
            type: ApplicationCommandOptionType.Number,
            required: true
        })
        bet: number,
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();

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
            const winValue = 2 * bet
            const embed = createCoinflipEmbed(
                bet,
                interaction.user,
                side,
                isWin ? Math.floor(winValue - winValue * 0.07) : 0,
                isWin ? 1 : 0,
                botSide
            );

            if (isWin) {
                user.currency.currencyCount += BigInt(Math.floor(winValue - winValue * 0.07));
            } else {
                user.currency.currencyCount -= BigInt(bet);
            }

            await currencyRepository.save(user.currency);
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error("Ошибка в команде coinflip:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка", interaction.user);
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

export default CoinflipCommand;