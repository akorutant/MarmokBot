import { Discord, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed, createGiftResultEmbed, createSuccessEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";
import { GiftReward } from "../types/giftTypes.js";
import { openGift, pluralizeGifts } from "../utils/giftUtils.js";
import { GiftStats } from "../entities/GiftStats.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";

@Discord()
class GiftCommand {
    private readonly VOICE_MINUTES_PER_GIFT = 480; 

    @Slash({
        name: "opengift",
        description: "Открыть накопленный подарок"
    })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard()
    )
    async opengift(
        @SlashOption({
            name: "amount",
            description: "Количество подарков для открытия (по умолчанию 1)",
            type: ApplicationCommandOptionType.Integer,
            required: false,
            minValue: 1,
            maxValue: 10
        })
        amount: number = 1,
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
            
            const giftStatsRepository = AppDataSource.getRepository(GiftStats);
            const giftStats = await giftStatsRepository.findOneOrFail({
                where: { discordId: discordUser.id }
            });
            
            if (giftStats.availableGifts <= 0) {
                const errorEmbed = createErrorEmbed(
                    "У вас нет доступных подарков для открытия. Накапливайте время в голосовых каналах, чтобы получить подарки!",
                    interaction.user
                );
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
            
            const giftsToOpen = Math.min(amount, giftStats.availableGifts);
            
            const results: GiftReward[] = [];
            let totalWin = 0;
            
            for (let i = 0; i < giftsToOpen; i++) {
                const reward = openGift();
                results.push(reward);
                
                if (reward.type === 'currency' && reward.amount) {
                    totalWin += reward.amount;
                }
            }
            
            giftStats.availableGifts -= giftsToOpen;
            giftStats.totalGiftsClaimed += giftsToOpen;
            await giftStatsRepository.save(giftStats);
            
            if (totalWin > 0) {
                const currencyRepository = AppDataSource.getRepository(Currency);
                await currencyRepository.increment(
                    { id: dbUser.currency.id },
                    "currencyCount",
                    totalWin
                );
            }
            
            const firstResult = results[0];
            const oneResults = [firstResult];
            const embed = createGiftResultEmbed(oneResults, totalWin, 0, interaction);
            
            if (giftsToOpen > 1) {
                embed.setTitle(`🎁 Открытие ${giftsToOpen} ${pluralizeGifts(giftsToOpen)} 🎁`);
                embed.setDescription(`<@${interaction.user.id}> открывает ${giftsToOpen} ${pluralizeGifts(giftsToOpen)}!`);
              }
            
            logger.info(`Пользователь ${discordUser.id} открыл ${giftsToOpen} подарков и получил ${totalWin}$`);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка в команде opengift:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при открытии подарка", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    @Slash({
        name: "mygifts",
        description: "Проверить информацию о доступных подарках"
    })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard()
    )
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
            const giftStats = await giftStatsRepository.findOneOrFail({
                where: { discordId: discordUser.id }
            });
              
            const totalVoiceMinutes = Number(dbUser.voiceMinutes);
            
            const potentialGifts = Math.floor(totalVoiceMinutes / this.VOICE_MINUTES_PER_GIFT);
            
            const claimedGifts = giftStats.claimedGiftsFromVoice;
            const availableGifts = giftStats.availableGifts;
            
            const minutesForNextGift = this.VOICE_MINUTES_PER_GIFT - (totalVoiceMinutes % this.VOICE_MINUTES_PER_GIFT);
            const hoursForNextGift = Math.floor(minutesForNextGift / 60);
            const remainingMinutes = minutesForNextGift % 60;
            
            const embed = createSuccessEmbed(
                `**🎁 Информация о ваших подарках**\n\n` +
                `⏱️ Всего времени в голосовых каналах: **${Math.floor(totalVoiceMinutes / 60)} ч ${totalVoiceMinutes % 60} мин**\n\n` +
                `**📊 Статистика подарков:**\n` +
                `🎁 Доступно: **${availableGifts} ${pluralizeGifts(availableGifts)}**\n` +
                `🔄 Получено за голос: **${claimedGifts} ${pluralizeGifts(claimedGifts)}**\n` +
                `⏳ До следующего: **${hoursForNextGift} ч ${remainingMinutes} мин**\n` +
                `ℹ️ Подарки накапливаются за каждые 8 часов\n\n` +
                `**📜 Общая статистика:**\n` +
                `🎁 Всего открыто: **${giftStats.totalGiftsClaimed} ${pluralizeGifts(giftStats.totalGiftsClaimed)}**`,
                interaction.user
              );
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error("Ошибка в команде mygifts:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при проверке подарков", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /* Команды модератора для управления подарками */
    
    @Slash({
        name: "addgifts",
        description: "Добавить подарки пользователю [Модератор]"
    })
    @EnsureUser()
    @Guard(
        EnsureUserGuard(),
        RequireRoles(["high_mod_level", "medium_mod_level"])
    )
    async addgifts(
        @SlashOption({
            name: "user",
            description: "Пользователь, которому нужно добавить подарки",
            type: ApplicationCommandOptionType.User,
            required: true
        })
        user: any,
        
        @SlashOption({
            name: "amount",
            description: "Количество подарков для добавления",
            type: ApplicationCommandOptionType.Integer,
            required: true,
            minValue: 1
        })
        amount: number,
        
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            
            const targetUserId = user.id;
            
            const giftStatsRepository = AppDataSource.getRepository(GiftStats);
            const giftStats = await giftStatsRepository.findOneOrFail({
                where: { discordId: targetUserId }
            });
            
            giftStats.availableGifts += amount;
            await giftStatsRepository.save(giftStats);
            
            const successEmbed = createSuccessEmbed(
                `Успешно добавлено **${amount} ${pluralizeGifts(amount)}** пользователю <@${targetUserId}>.\n` +
                `Теперь доступно: **${giftStats.availableGifts} ${pluralizeGifts(giftStats.availableGifts)}**`,
                interaction.user
              );
            
            logger.info(`Модератор ${interaction.user.id} добавил ${amount} подарков пользователю ${targetUserId}`);
            
            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error) {
            logger.error("Ошибка в команде addgifts:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при добавлении подарков", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
    
    @Slash({
        name: "removegifts",
        description: "Удалить подарки у пользователя [Модератор]"
    })
    @EnsureUser()
    @Guard(
        EnsureUserGuard(),
        RequireRoles(["high_mod_level", "medium_mod_level"])
    )
    async removegifts(
        @SlashOption({
            name: "user",
            description: "Пользователь, у которого нужно удалить подарки",
            type: ApplicationCommandOptionType.User,
            required: true
        })
        user: any,
        
        @SlashOption({
            name: "amount",
            description: "Количество подарков для удаления",
            type: ApplicationCommandOptionType.Integer,
            required: true,
            minValue: 1
        })
        amount: number,
        
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            
            const member = interaction.guild?.members.cache.get(interaction.user.id);
            if (!member?.permissions.has("ManageGuild")) {
                const errorEmbed = createErrorEmbed(
                    "У вас нет прав для использования этой команды",
                    interaction.user
                );
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
            
            const targetUserId = user.id;
            
            const giftStatsRepository = AppDataSource.getRepository(GiftStats);
            const giftStats = await giftStatsRepository.findOneOrFail({
                where: { discordId: targetUserId }
            });
            
            const giftsToRemove = Math.min(amount, giftStats.availableGifts);
            giftStats.availableGifts -= giftsToRemove;
            await giftStatsRepository.save(giftStats);
            
            const successEmbed = createSuccessEmbed(
                `Успешно удалено **${giftsToRemove} ${pluralizeGifts(giftsToRemove)}** у <@${targetUserId}>.\n` +
                `Теперь доступно: **${giftStats.availableGifts} ${pluralizeGifts(giftStats.availableGifts)}**`,
                interaction.user
              );
            
            logger.info(`Модератор ${interaction.user.id} удалил ${giftsToRemove} подарков у пользователя ${targetUserId}`);
            
            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error) {
            logger.error("Ошибка в команде removegifts:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка при удалении подарков", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}

export default GiftCommand;