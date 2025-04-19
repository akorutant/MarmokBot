import { Client, EmbedBuilder } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { GiftStats } from "../entities/GiftStats.js";
import { Currency } from "../entities/Currency.js";
import { openGift } from "../utils/giftUtils.js";
import logger from "../services/logger.js";
import { RARITY_COLORS } from "../constants/colors.js";

/**
 * Сервис для управления автоматической выдачей подарков за время в голосовом канале
 */
export class VoiceGiftService {
  // Количество минут в голосовом канале для получения подарка
  private readonly VOICE_MINUTES_PER_GIFT = 480; // 8 часов = 480 минут
  
  constructor(private client: Client) {
    logger.info("VoiceGiftService инициализирован");
  }
  
  /**
   * Проверяет и выдает подарки за накопленное время в голосовом канале
   */
  public async checkAndAwardGifts(userId: string): Promise<void> {
    try {
      // Получаем данные пользователя
      const userRepository = AppDataSource.getRepository(User);
      const giftStatsRepository = AppDataSource.getRepository(GiftStats);
      const currencyRepository = AppDataSource.getRepository(Currency);
      
      // Загружаем пользователя с его валютой
      const user = await userRepository.findOne({
        where: { discordId: userId },
        relations: ["currency"]
      });
      
      if (!user) {
        logger.warn(`Пользователь ${userId} не найден при проверке подарков`);
        return;
      }
      
      // Загружаем статистику подарков
      let giftStats = await giftStatsRepository.findOne({
        where: { discordId: userId }
      });
      
      if (!giftStats) {
        logger.warn(`GiftStats для пользователя ${userId} не найдены, создаем`);
        giftStats = giftStatsRepository.create({
          discordId: userId,
          userId: user.id,
          user: user,
          trackedVoiceMinutes: 0n,
          claimedGiftsFromVoice: 0,
          totalGiftsClaimed: 0
        });
        await giftStatsRepository.save(giftStats);
      }
      
      // Получаем текущее время в голосовом канале
      const totalVoiceMinutes = Number(user.voiceMinutes);
      
      // Вычисляем, сколько подарков можно получить
      const potentialGifts = Math.floor(totalVoiceMinutes / this.VOICE_MINUTES_PER_GIFT);
      const claimedGifts = giftStats.claimedGiftsFromVoice;
      const availableGifts = Math.max(0, potentialGifts - claimedGifts);
      
      // Если доступных подарков нет, выходим
      if (availableGifts === 0) {
        return;
      }
      
      logger.info(`Пользователю ${userId} доступно ${availableGifts} подарков за время в голосовом канале`);
      
      // Выдаем все доступные подарки
      let totalWin = 0;
      const rewards = [];
      
      for (let i = 0; i < availableGifts; i++) {
        const reward = openGift();
        rewards.push(reward);
        
        if (reward.type === 'currency' && reward.amount) {
          totalWin += reward.amount;
        }
      }
      
      // Обновляем статистику подарков
      giftStats.claimedGiftsFromVoice += availableGifts;
      giftStats.totalGiftsClaimed += availableGifts;
      await giftStatsRepository.save(giftStats);
      
      // Начисляем выигрыш
      if (totalWin > 0) {
        await currencyRepository.increment(
          { id: user.currency.id },
          "currencyCount",
          totalWin
        );
      }
      
      logger.info(`Пользователь ${userId} автоматически получил ${availableGifts} подарков и выиграл ${totalWin}$`);
      
      // Отправляем сообщение пользователю в ЛС
      await this.sendGiftNotification(userId, availableGifts, totalWin, rewards);
      
    } catch (error) {
      logger.error(`Ошибка при выдаче подарков пользователю ${userId}: ${error}`);
    }
  }
  
  /**
   * Отправляет уведомление о полученных подарках в личные сообщения
   */
  private async sendGiftNotification(
    userId: string, 
    giftCount: number, 
    totalWin: number, 
    rewards: any[]
  ): Promise<void> {
    try {
      // Получаем пользователя Discord
      const discordUser = await this.client.users.fetch(userId);
      if (!discordUser) {
        logger.warn(`Не удалось найти Discord пользователя ${userId} для отправки уведомления о подарках`);
        return;
      }
      
      // Создаем эмбед с информацией о подарках
      const embed = new EmbedBuilder()
        .setTitle(`🎁 Вы получили ${giftCount} ${this.pluralizeGifts(giftCount)}!`)
        .setDescription(`За ${giftCount * 8} часов проведенных в голосовом канале вы автоматически получили ${giftCount} ${this.pluralizeGifts(giftCount)}.`)
        .setColor(totalWin > 0 ? RARITY_COLORS.legendary : RARITY_COLORS.common)
        .setTimestamp();
      
      // Если получен только один подарок, показываем его содержимое
      if (giftCount === 1) {
        const reward = rewards[0];
        let valueText = '';
        
        if (reward.type === 'nothing') {
          valueText = 'Ничего ценного';
        } else if (reward.type === 'currency' && reward.amount) {
          valueText = `${reward.amount}$`;
        }
        
        embed.addFields({
          name: `${reward.emoji} ${reward.name}`,
          value: valueText
        });
      } else {
        // Если получено несколько подарков, показываем общую сумму выигрыша
        embed.addFields({
          name: '💰 Общий выигрыш',
          value: `${totalWin}$`
        });
      }
      
      embed.setFooter({ 
        text: 'Подарки выдаются автоматически за каждые 8 часов в голосовом канале',
        iconURL: discordUser.displayAvatarURL()
      });
      
      // Отправляем сообщение в ЛС
      await discordUser.send({ embeds: [embed] });
      logger.info(`Отправлено уведомление о подарках пользователю ${userId}`);
      
    } catch (error) {
      logger.error(`Ошибка при отправке уведомления о подарках пользователю ${userId}: ${error}`);
      // Если не удалось отправить в ЛС, не нужно прерывать процесс
    }
  }
  
  /**
   * Склоняет слово "подарок" в зависимости от числа
   */
  private pluralizeGifts(count: number): string {
    if (count === 1) {
      return "подарок";
    } else if (count >= 2 && count <= 4) {
      return "подарка";
    } else {
      return "подарков";
    }
  }
}