import { Discord, Slash, SlashOption, Guard, SlashChoice } from "discordx";
import { RateLimit, TIME_UNIT } from "@discordx/utilities"
import { CommandInteraction, User as discordUser, ApplicationCommandOptionType, EmbedBuilder } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Currency } from "../entities/Currency.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createProfileEmbed, createErrorEmbed, createCoinflipEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { resolve } from "path";
import { Int32 } from "typeorm";

const currentDate = Math.floor(new Date().getTime() / 1000)

@Discord()
class CoinflipCommand {
    @Slash({ description: "Подкинуть монетку" })
    @Guard(
        RateLimit(TIME_UNIT.hours, 1, {
          message: `Вы уже сыграли. Приходите через <t:${currentDate + 3600}:R>`,
          rateValue: 1,
        }),
      )
    @Guard(ChannelGuard("user_commands_channel"))
    @EnsureUser()

    async coin(
        @SlashChoice({ name: "Орел", value: "eagle"})
        @SlashChoice({ name: "Решка", value: "reshka"})
        @SlashOption({
            name: "side",
            description: "Выберите сторону",
            type: ApplicationCommandOptionType.String,
            required: true
        })
        side: string,
        @SlashOption({
            name: "bet",
            description: "Подкинуть монетку",
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
            
            // Получение юзера в дб
            let user = await userRepository.findOne({
                where: { discordId: interaction.user.id },
                relations: ["currency"]
            });

            // Проверка, есть ли юзер, деньги и сумму ставки
            if (user?.currency && user.currency.currencyCount < bet) {
                await interaction.reply({content: "У вас нет столько денег.", ephemeral: true})
                return
            }

            const sides = ["eagle", "reshka"];
            const userBet = bet;
            const userSide = side;
            const botSide = sides[Math.floor(Math.random() * sides.length)]

            const embed_start = createCoinflipEmbed(
                userBet,
                interaction.user,
                userSide
            )
            await interaction.reply({ embeds: [embed_start]});

            // Логика игры
            let result = 0;
            let winMoney: number = 0;
            if (botSide == userSide) {
                result = 1
                winMoney = Math.floor(userBet*2 - ((userBet*2)*0.07))
                if (user?.currency) {
                    user.currency.currencyCount += BigInt(winMoney);
                    await currencyRepository.save(user.currency);
                    logger.info(`Пользователь ${interaction.id} выиграл в монетку ${winMoney} валюты`);
            }
            } else {
                if (user?.currency) {
                    user.currency.currencyCount -= BigInt(userBet);
                    await currencyRepository.save(user.currency);
                    logger.info(`Пользователь ${interaction.id} проиграл в монетку ${winMoney} валюты`);
                }
            }

            const embed_finish = createCoinflipEmbed(
                userBet,
                interaction.user,
                userSide,
                winMoney,
                result,
                botSide
            )
            await interaction.editReply({ embeds: [embed_finish]});
        } catch (error) {
            logger.error("Ошибка в команде coin:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при получении данных", interaction.user);
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

export default CoinflipCommand;