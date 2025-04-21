import { Discord, Slash, SlashOption, Guard, ButtonComponent } from "discordx";
import { CommandInteraction, ButtonInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder, ApplicationCommandOptionType, User, EmbedBuilder } from "discord.js";
import { CheckMoney } from "../utils/decorators/CheckMoney.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createDuelEmbed } from "../utils/embedBuilder.js";
import { AppDataSource } from "../services/database.js";
import { Currency } from "../entities/Currency.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";

@Discord()
export class DuelCommand {
    private duelTimeouts: Map<string, NodeJS.Timeout> = new Map();

    @Slash({ description: "Начать дуэль", name: "duel" })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        CheckMoney(),
        Cooldown({ seconds: 30 }),
        EnsureUserGuard()
    )
    async startDuel(
        @SlashOption({
            name: "bet",
            description: "Сумма ставки",
            type: ApplicationCommandOptionType.Number,
            required: true,
            minValue: 500,
            maxValue: 1500
        })
        bet: number,
        interaction: CommandInteraction
    ) {
        try {
            const btn = new ButtonBuilder()
                .setCustomId(`duel_${interaction.user.id}_${bet}`)
                .setLabel("Принять вызов")
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

            const initialEmbed = createDuelEmbed(bet, interaction.user, undefined, undefined, undefined, 10);

            const response = await interaction.reply({
                embeds: [initialEmbed],
                components: [row],
            });
            
            const message = await interaction.fetchReply();

            const timeout = setTimeout(async () => {
                try {
                    await message.edit({
                        embeds: [createDuelEmbed(bet, interaction.user, undefined, undefined, undefined, 0, true)],
                        components: []
                    });
                } catch (error) {
                    console.error("Error updating expired duel:", error);
                }
                this.duelTimeouts.delete(interaction.user.id);
            }, 10000);

            this.duelTimeouts.set(interaction.user.id, timeout);
        } catch (error) {
            console.error("Duel command error:", error);
            await interaction.reply({
                content: "❌ Ошибка создания дуэли",
                ephemeral: true
            });
        }
    }

    @ButtonComponent({ id: /duel_\d+_\d+/ })
    @Guard(
        CheckMoney(),
        EnsureUserGuard()
    )
    async acceptDuel(interaction: ButtonInteraction) {
        try {
            const [_, creatorId, betStr] = interaction.customId.split("_");
            const bet = parseInt(betStr);

            const timeout = this.duelTimeouts.get(creatorId);
            if (timeout) {
                clearTimeout(timeout);
                this.duelTimeouts.delete(creatorId);
            }

            if (interaction.user.id === creatorId) {
                await interaction.reply({
                    content: "❌ Нельзя принять свой же вызов",
                    ephemeral: true
                });
                return;
            }

            const winner = Math.random() > 0.5 ? interaction.user : await interaction.client.users.fetch(creatorId);
            const loser = winner.id === interaction.user.id ? 
                await interaction.client.users.fetch(creatorId) : interaction.user;
            const winAmount = Math.floor((bet * 2 * 0.97) - (bet));

            const currencyRepo = AppDataSource.getRepository(Currency);
            const [winnerCurrency, loserCurrency] = await Promise.all([
                currencyRepo.findOne({ where: { user: { discordId: winner.id } } }),
                currencyRepo.findOne({ where: { user: { discordId: loser.id } } })
            ]);

            if (!winnerCurrency || !loserCurrency) {
                throw new Error("Currency not found");
            }

            await currencyRepo.manager.transaction(async manager => {
                winnerCurrency.currencyCount += BigInt(winAmount);
                loserCurrency.currencyCount -= BigInt(bet);
                await manager.save([winnerCurrency, loserCurrency]);
            });

            await interaction.message.edit({
                embeds: [createDuelEmbed(
                    bet,
                    await interaction.client.users.fetch(creatorId),
                    loser,  
                    winAmount,
                    winner
                )],
                components: []
            });

            await interaction.deferUpdate();
        } catch (error) {
            console.error("Duel accept error:", error);
            await interaction.reply({
                content: "❌ Ошибка принятия дуэли",
                ephemeral: true
            });
        }
    }
}