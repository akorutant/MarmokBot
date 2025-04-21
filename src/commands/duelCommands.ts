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
      @SlashOption({
        name: "opponent",
        description: "Пользователь, которого хотите вызвать на дуэль",
        type: ApplicationCommandOptionType.User,
        required: false
      })
      opponent: User | undefined,
      interaction: CommandInteraction
    ) {
      try {
        if (opponent?.id === interaction.user.id) {
          await interaction.reply({
            content: "❌ Вы не можете вызвать самого себя на дуэль.",
            ephemeral: true
          });
          return;
        }
    
        const expireTimestamp = Math.floor(Date.now() / 1000) + 30;
        const customId = `duel_${interaction.user.id}_${bet}_${expireTimestamp}_${opponent?.id ?? "any"}`;
    
        const btn = new ButtonBuilder()
          .setCustomId(customId)
          .setLabel("Принять вызов")
          .setStyle(ButtonStyle.Primary);
    
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
    
        const embed = createDuelEmbed(
          bet,
          interaction.user,
          opponent,
          undefined,
          undefined,
          expireTimestamp
        );
    
        const message = await interaction.reply({
          embeds: [embed],
          components: [row]
        });
    
        const replyMessage = await interaction.fetchReply();
        const timeout = setTimeout(async () => {
            try {
              await replyMessage.edit({
                embeds: [createDuelEmbed(
                  bet,
                  interaction.user,
                  opponent,
                  undefined,
                  undefined,
                  expireTimestamp,
                  true
                )],
                components: []
              });
            } catch (err) {
              console.error("Error updating expired duel:", err);
            }
            this.duelTimeouts.delete(interaction.user.id);
          }, 30000);
          
    
        this.duelTimeouts.set(interaction.user.id, timeout);
      } catch (error) {
        console.error("Duel command error:", error);
        await interaction.reply({
          content: "❌ Ошибка создания дуэли",
          ephemeral: true
        });
      }
    }
    

    @ButtonComponent({ id: /duel_\d+_\d+_\d+_(\d+|any)/ })
    @Guard(
      CheckMoney(),
      EnsureUserGuard()
    )
    async acceptDuel(interaction: ButtonInteraction) {
      try {
        const [_, creatorId, betStr, timestampStr, opponentId] = interaction.customId.split("_");
        const bet = parseInt(betStr, 10);
    
        if (interaction.user.id === creatorId) {
          await interaction.reply({
            content: "❌ Нельзя принять свой же вызов.",
            ephemeral: true
          });
          return;
        }
    
        if (opponentId !== "any" && interaction.user.id !== opponentId) {
          await interaction.reply({
            content: "❌ Эта дуэль предназначена другому пользователю.",
            ephemeral: true
          });
          return;
        }
    
        const timeout = this.duelTimeouts.get(creatorId);
        if (timeout) {
          clearTimeout(timeout);
          this.duelTimeouts.delete(creatorId);
        }
    
        const creatorUser = await interaction.client.users.fetch(creatorId);
        const winner = Math.random() > 0.5 ? interaction.user : creatorUser;
        const loser = winner.id === interaction.user.id ? creatorUser : interaction.user;
        const winAmount = Math.floor((bet * 2 * 0.97) - bet);
    
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
          embeds: [
            createDuelEmbed(
              bet,
              creatorUser,
              loser,
              winAmount,
              winner
            )
          ],
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

