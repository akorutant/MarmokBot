import { Client, EmbedBuilder } from 'discord.js';
import { AppDataSource } from '../services/database.js';
import { User } from '../entities/User.js';
import { GiftStats } from '../entities/GiftStats.js';
import logger from '../services/logger.js';
import { RARITY_COLORS } from '../constants/colors.js';

/**
 * Service for managing automatic gift awarding based on voice channel time.
 */
export class VoiceGiftService {
  private readonly VOICE_MINUTES_PER_GIFT = 480;

  constructor(private client: Client) {
    logger.info('VoiceGiftService initialized');
  }

  /**
   * Checks and awards gifts based on accumulated voice channel time.
   */
  public async checkAndAwardGifts(userId: string): Promise<void> {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const giftStatsRepository = AppDataSource.getRepository(GiftStats);

      const user = await userRepository.findOneOrFail({
        where: { discordId: userId },
        relations: ['giftStats'],
      });

      const giftStats = user.giftStats;
      const trackedMinutesNumber = Number(giftStats.trackedVoiceMinutes);
      const potentialGifts = Math.floor(trackedMinutesNumber / this.VOICE_MINUTES_PER_GIFT);
      const newGifts = potentialGifts - giftStats.claimedGiftsFromVoice;

      if (newGifts > 0) {
        giftStats.claimedGiftsFromVoice += newGifts;
        giftStats.availableGifts += newGifts;
        await giftStatsRepository.save(giftStats);

        logger.info(`Awarded ${newGifts} gift(s) to ${userId}`);
        await sendGiftNotification(userId, newGifts, giftStats.availableGifts);
      }
    } catch (error) {
      logger.error(`Error in checkAndAwardGifts: ${error}`);
    }
  }


  /**
   * Returns the correct plural form of "подарок" based on the count.
   */
  private pluralizeGifts(count: number): string {
    if (count % 10 === 1 && count % 100 !== 11) {
      return 'подарок';
    } else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
      return 'подарка';
    } else {
      return 'подарков';
    }
  }
}
