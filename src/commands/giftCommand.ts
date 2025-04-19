import { Discord, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed, createGiftResultEmbed, createSuccessEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import { GiftReward } from "../types/giftTypes.js";
import { openGift } from "../utils/giftUtils.js";
import { GiftStats } from "../entities/GiftStats.js";
import { CheckMoney } from "../utils/decorators/CheckMoney.js";

@Discord()
class GiftCommand {
    // Количество минут в голосовом канале, необходимое для получения одного подарка
    private readonly VOICE_MINUTES_PER_GIFT = 480; // 8 часов = 480 минут

    @Slash({
        name: "gift",
        description: "Получить бесплатный ежедневный подарок"
    })
    @Guard(
        Cooldown({ hours: 24, message: "⏳ Вы сможете получить следующий ежедневный подарок через {time}" }),
        ChannelGuard("user_commands_channel")
    )
    @EnsureUser()
    async gift(
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            const discordUser = interaction.user;
            
            const userRepository = AppDataSource.getRepository(DBUser);
            const dbUser = await userRepository.findOneOrFail({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });
            
            const results: GiftReward[] = [];
            let totalWin = 0;
            
            const reward = openGift();
            results.push(reward);
            
            if (reward.type === 'currency' && reward.amount) {
                totalWin += reward.amount;
            }
            
            const giftStatsRepository = AppDataSource.getRepository(GiftStats);
            let giftStats = (await giftStatsRepository.findOne({
                where: { discordId: discordUser.id }
              }))!;
              
  
            
            // Благодаря EnsureUser, giftStats гарантированно будет существовать
            giftStats.lastDailyGiftClaim = new Date();
            giftStats.totalGiftsClaimed += 1;
            await giftStatsRepository.save(giftStats);
            
            if (totalWin > 0) {
                const currencyRepository = AppDataSource.getRepository(Currency);
                await currencyRepository.increment(
                    { id: dbUser.currency.id },
                    "currencyCount",
                    totalWin
                );
            }
            
            const embed = createGiftResultEmbed(results, totalWin, 0, interaction);
            
            logger.info(`Пользователь ${discordUser.id} открыл ежедневный подарок и получил ${totalWin}$`);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка в команде подарок:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при открытии подарка", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    @Slash({
        name: "mygifts",
        description: "Проверить информацию о доступных подарках"
    })
    @Guard(
        ChannelGuard("user_commands_channel")
    )
    @EnsureUser()
    async mygifts(
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            const discordUser = interaction.user;
            
            const userRepository = AppDataSource.getRepository(DBUser);
            const dbUser = await userRepository.findOneOrFail({
                where: { discordId: discordUser.id }
            });
            
            const giftStatsRepository = AppDataSource.getRepository(GiftStats);
            let giftStats = (await giftStatsRepository.findOne({
                where: { discordId: discordUser.id }
              }))!;
              
            
            // Благодаря EnsureUser, giftStats гарантированно будет существовать
            
            const totalVoiceMinutes = Number(dbUser.voiceMinutes);
            
            // Вычисляем, сколько подарков можно было бы получить за все время в голосовом
            const potentialGifts = Math.floor(totalVoiceMinutes / this.VOICE_MINUTES_PER_GIFT);
            
            // Сколько подарков уже получено
            const claimedGifts = giftStats.claimedGiftsFromVoice;
            
            // Доступно подарков сейчас (всегда 0, так как подарки выдаются автоматически)
            const availableGifts = 0; // Подарки выдаются автоматически
            
            // Сколько минут осталось до следующего подарка
            const minutesForNextGift = this.VOICE_MINUTES_PER_GIFT - (totalVoiceMinutes % this.VOICE_MINUTES_PER_GIFT);
            const hoursForNextGift = Math.floor(minutesForNextGift / 60);
            const remainingMinutes = minutesForNextGift % 60;
            
            // Информация о ежедневном подарке
            let dailyGiftInfo = "❌ Уже получен сегодня";
            if (!giftStats.lastDailyGiftClaim || isNextDayAvailable(giftStats.lastDailyGiftClaim)) {
                dailyGiftInfo = "✅ Доступен для получения!";
            }
            
            // Статистика по всем открытым подаркам
            const embed = createSuccessEmbed(
                `**🎁 Информация о ваших подарках**\n\n` +
                `⏱️ Всего времени в голосовых каналах: **${Math.floor(totalVoiceMinutes / 60)} ч ${totalVoiceMinutes % 60} мин**\n\n` +
                `**📊 Статистика подарков за голосовой канал:**\n` +
                `🔄 Всего получено подарков: **${claimedGifts}**\n` +
                `⏳ До следующего подарка: **${hoursForNextGift} ч ${remainingMinutes} мин**\n` +
                `ℹ️ Подарки выдаются автоматически за каждые 8 часов в голосовом канале\n\n` +
                `**🎯 Ежедневный подарок:**\n` +
                `${dailyGiftInfo}\n\n` +
                `**📜 Общая статистика:**\n` +
                `🎁 Всего открыто подарков: **${giftStats.totalGiftsClaimed}**`,
                interaction.user
            );
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка в команде mygifts:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при проверке подарков", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    @Slash({
        name: "buygift",
        description: "Купить подарок за валюту"
    })
    @Guard(
        ChannelGuard("user_commands_channel"),
        CheckMoney()
    )
    @EnsureUser()
    async buygift(
        @SlashOption({
            name: "bet",
            description: "Сумма для покупки подарка (500$ за один подарок)",
            type: ApplicationCommandOptionType.Integer,
            required: true,
            minValue: 500,
            maxValue: 5000
        })
        bet: number,
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            const discordUser = interaction.user;
            
            // Получаем пользователя из базы данных
            const userRepository = AppDataSource.getRepository(DBUser);
            const dbUser = await userRepository.findOneOrFail({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });
            
            const currencyRepository = AppDataSource.getRepository(Currency);
            
            // Стоимость одного подарка
            const giftCost = 500;
            
            // Сколько подарков можно купить за указанную сумму
            const giftCount = Math.floor(bet / giftCost);
            const totalCost = giftCount * giftCost;
            
            if (giftCount <= 0) {
                const errorEmbed = createErrorEmbed(
                    `Минимальная сумма для покупки подарка: ${giftCost}$`,
                    interaction.user
                );
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
            
            // Снимаем валюту
            const newBalance = dbUser.currency.currencyCount - BigInt(totalCost);
            await currencyRepository.update(
                { id: dbUser.currency.id },
                { currencyCount: newBalance }
            );
            
            // Открываем подарки
            const results: GiftReward[] = [];
            let totalWin = 0;
            
            for (let i = 0; i < giftCount; i++) {
                const reward = openGift();
                results.push(reward);
                
                if (reward.type === 'currency' && reward.amount) {
                    totalWin += reward.amount;
                }
            }
            
            // Обновляем статистику подарков
            const giftStatsRepository = AppDataSource.getRepository(GiftStats);
            let giftStats = (await giftStatsRepository.findOne({
                where: { discordId: discordUser.id }
              }))!;
              
            
            giftStats.totalGiftsClaimed += giftCount;
            await giftStatsRepository.save(giftStats);
            
            // Начисляем выигрыш
            if (totalWin > 0) {
                await currencyRepository.increment(
                    { id: dbUser.currency.id },
                    "currencyCount",
                    totalWin
                );
            }
            
            const firstResult = results[0];
            const oneResults = [firstResult];
            const embed = createGiftResultEmbed(oneResults, totalWin, totalCost, interaction);
            
            if (giftCount > 1) {
                embed.setTitle(`🎁 Открытие ${giftCount} подарков 🎁`);
                embed.setDescription(`<@${interaction.user.id}> открывает ${giftCount} подарков!`);
            }
            
            logger.info(`Пользователь ${discordUser.id} купил ${giftCount} подарков за ${totalCost}$ и получил ${totalWin}$`);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка в команде buygift:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при покупке подарка", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}

/**
 * Проверяет, доступен ли подарок на следующий день
 * @param lastClaimDate Дата последнего получения подарка
 * @returns true, если прошло 24 часа с момента последнего получения
 */
function isNextDayAvailable(lastClaimDate: Date): boolean {
    const now = new Date();
    const timeDiff = now.getTime() - lastClaimDate.getTime(); 
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    return hoursDiff >= 24;
}

export default GiftCommand;