import { Discord, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed, createCasinoResultEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import { determineCasinoResult } from "../utils/casinoUtils.js";
import { CheckMoney } from "../utils/decorators/CheckMoney.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";

@Discord()
class CasinoCommand {
    private readonly MIN_BET = 1000;
    private readonly MAX_BET = 10000;
    private readonly TAX_RATE = 0.07;

    @Slash({ 
        name: "casino", 
        description: "Проверьте свою удачу в казино" 
    })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        CheckMoney(),
        EnsureUserGuard(),
        Cooldown({ seconds: 10 })
    )
    async casino(
        @SlashOption({
            name: "bet",
            description: "Размер ставки (от 1000 до 10000)",
            type: ApplicationCommandOptionType.Integer,
            required: true,
            minValue: 1000,
            maxValue: 10000
        })
        bet: number,
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            const discordUser = interaction.user;
            
            if (bet < this.MIN_BET || bet > this.MAX_BET) {
                const errorEmbed = createErrorEmbed(
                    `Размер ставки должен быть от ${this.MIN_BET}$ до ${this.MAX_BET}$`,
                    interaction.user
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });
            
            const currencyRepository = AppDataSource.getRepository(Currency);
            
            if (dbUser.currency.currencyCount < BigInt(bet)) {
                const errorEmbed = createErrorEmbed(
                    `У вас недостаточно средств! Необходимо ${bet}$, у вас ${dbUser.currency.currencyCount}$`, 
                    interaction.user
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }
            
            const newBalance = dbUser.currency.currencyCount - BigInt(bet);
            await currencyRepository.update(
                { id: dbUser.currency.id },
                { currencyCount: newBalance }
            );
            
            const result = determineCasinoResult();
            const winAmount = Math.floor(bet * result.multiplier);
            let tax = 0;
            let netWin = winAmount;

            if (winAmount > 0) {
                tax = Math.floor(winAmount * this.TAX_RATE);
                netWin = winAmount - tax;
                
                await currencyRepository.update(
                    { id: dbUser.currency.id },
                    { currencyCount: newBalance + BigInt(netWin) }
                );
            }
            
            const embed = createCasinoResultEmbed(
                bet, 
                netWin, 
                result, 
                interaction
            );
            
            logger.info(
                `Пользователь ${discordUser.id} сделал ставку ${bet}$ ` +
                `в казино и ${winAmount > 0 ? `выиграл ${netWin}$ (налог ${tax}$)` : 'проиграл'}`
            );
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            logger.error("Ошибка в команде казино:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при обработке ставки", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}

export default CasinoCommand;
