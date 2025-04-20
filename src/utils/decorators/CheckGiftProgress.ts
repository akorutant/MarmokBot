import { AppDataSource } from '../../services/database.js';
import { User } from '../../entities/User.js';
import { GiftStats } from '../../entities/GiftStats.js';
import { Currency } from '../../entities/Currency.js';
import { TextChannel, EmbedBuilder, Client } from 'discord.js';
import logger from '../../services/logger.js';
import { RARITY_COLORS } from '../../constants/colors.js';
import { pluralizeGifts } from '../giftUtils.js';
import { Config } from '../../entities/Config.js';

const MINUTES_PER_GIFT = 480; 

let discordClient: Client | undefined;

export function setDiscordClient(client: Client) {
  discordClient = client;
  logger.info('Discord client установлен для системы подарков');
}

/**
 * Унифицированная функция проверки и начисления подарков
 * @param discordId ID пользователя Discord
 * @param forceCheck Форсировать проверку (используется при выходе из войса)
 * @returns Объект с информацией о начисленных подарках или null
 */
export async function checkAndProcessGifts(discordId: string, forceCheck: boolean = false): Promise<{
  newGifts: number;
  totalAvailable: number;
} | null> {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const giftRepo = AppDataSource.getRepository(GiftStats);

    const user = await userRepo.findOne({ 
      where: { discordId },
      relations: ["exp", "currency", "giftStats"]
    });
    
    if (!user) {
      logger.warn(`checkAndProcessGifts: Пользователь не найден для ID ${discordId}`);
      return null;
    }

    let giftStats = await giftRepo.findOne({ where: { discordId } });
    if (!giftStats) {
      giftStats = giftRepo.create({
        discordId,
        userId: user.id,
        user,
        trackedVoiceMinutes: user.voiceMinutes, 
        claimedGiftsFromVoice: 0,
        totalGiftsClaimed: 0,
        availableGifts: 0,
        lastDailyGiftClaim: null
      });
      
      logger.debug(`checkAndProcessGifts: Создана новая запись GiftStats для ${discordId}`);
    } else if (forceCheck) {
      if (user.voiceMinutes > giftStats.trackedVoiceMinutes) {
        logger.info(`checkAndProcessGifts: Синхронизация счетчиков для ${discordId}. user.voiceMinutes=${user.voiceMinutes}, giftStats.trackedVoiceMinutes=${giftStats.trackedVoiceMinutes}`);
        giftStats.trackedVoiceMinutes = user.voiceMinutes;
      }
    }

    const minutes = Number(user.voiceMinutes);
    const potentialGifts = Math.floor(minutes / MINUTES_PER_GIFT);
    
    const newGifts = potentialGifts - giftStats.claimedGiftsFromVoice;
    
    if (newGifts <= 0 && !forceCheck) {
      return null; 
    }
    
    if (newGifts > 0) {
      giftStats.claimedGiftsFromVoice += newGifts;
      giftStats.availableGifts += newGifts;
      
      logger.info(`checkAndProcessGifts: Пользователь ${discordId} получил ${newGifts} подарков. Всего доступно: ${giftStats.availableGifts}`);
      
      await giftRepo.save(giftStats);
      
      return {
        newGifts,
        totalAvailable: Number(giftStats.availableGifts)
      };
    } else if (forceCheck) {
      await giftRepo.save(giftStats);
      logger.debug(`checkAndProcessGifts: Форсированная синхронизация для ${discordId} без новых подарков`);
    }
    
    return null;
  } catch (error) {
    logger.error(`checkAndProcessGifts error: ${error}`);
    return null;
  }
}

/**
 * Декоратор для проверки прогресса подарков
 */
export function CheckGiftProgress() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      await originalMethod.apply(this, args);

      try {
        let discordId: string | undefined;
        const firstArg = args[0];
        if (typeof firstArg === 'string') {
          discordId = firstArg;
        } else if (firstArg?.author?.id) {
          discordId = firstArg.author.id;
        } else if (Array.isArray(firstArg) && (firstArg[1]?.member?.id || firstArg[0]?.member?.id)) {
          discordId = firstArg[1]?.member?.id || firstArg[0]?.member?.id;
        } else if (args.find(arg => arg?.user?.id)) {
          const interaction = args.find(arg => arg?.user?.id);
          discordId = interaction.user.id;
        }
        
        if (!discordId) return;
        
        const giftResult = await checkAndProcessGifts(discordId);
        
        if (giftResult && giftResult.newGifts > 0) {
          await sendGiftNotification(discordId, giftResult.newGifts, giftResult.totalAvailable);
        }
      } catch (error) {
        logger.error(`CheckGiftProgress decorator error: ${error}`);
      }
    };
    return descriptor;
  };
}

/**
 * Отправляет уведомление о начисленных подарках в личные сообщения пользователя
 * или в резервный канал при ошибке
 */
export async function sendGiftNotification(
  discordId: string,
  giftCount: number,
  totalAvailable: number
) {
    if (!discordClient?.isReady()) { 
        logger.error('Discord client not initialized or not ready for gift notifications');
        return;
    }

  const embed = new EmbedBuilder()
    .setColor(RARITY_COLORS.epic)
    .setTitle(`🎁 Вы получиили ${giftCount} ${pluralizeGifts(giftCount)}!`)
    .setDescription(
      `За ${(giftCount * 8)} часов в голосовом канале вы получили ${giftCount} ${pluralizeGifts(giftCount)}.` +
      `\n\nУ вас теперь ${totalAvailable} ${pluralizeGifts(totalAvailable)} доступно для открытия.`
    )
    .addFields({
      name: '💡 Как открыть подарки',
      value: 'Используйте команду `/opengift`, чтобы открыть свои подарки и получить награду!',
    })
    .setTimestamp()
    .setFooter({ text: 'Подарки выдаются за каждые 8 часов в голосовом канале' });

  try {
    const user = await discordClient.users.fetch(discordId);
    await user.send({ embeds: [embed] });
    logger.info(`Sent gift notification to ${user.tag} in DM`);
    return;  
  } catch (dmError) {
    logger.warn(`Cannot send gift DM to ${discordId}, trying fallback channel: ${dmError}`);
  }

  try {
    const configRepo = AppDataSource.getRepository(Config);
    const config = await configRepo.findOneBy({ key: 'user_command_channel' });

    if (!config) {
      logger.error("Fallback channel ID not found in config");
      return;
    }

    const channelId = config.value;
    const channel = await discordClient.channels.fetch(channelId) as TextChannel;

    if (!channel || !channel.isTextBased()) {
      logger.error(`Fallback channel ${channelId} is invalid`);
      return;
    }

    const publicEmbed = new EmbedBuilder()
      .setColor(RARITY_COLORS.epic)
      .setTitle(`🎁 <@${discordId}> получил ${giftCount} ${pluralizeGifts(giftCount)}!`)
      .setDescription(`Теперь у него ${totalAvailable} ${pluralizeGifts(totalAvailable)} доступно для открытия!`)
      .addFields({
        name: '💡 Как открыть подарки',
        value: 'Используйте команду `/opengift`, чтобы открыть свои подарки и получить награду!',
      })
      .setTimestamp();

    await channel.send({ embeds: [publicEmbed] });
    logger.info(`Sent gift notification for ${discordId} in fallback channel`);
  } catch (fallbackError) {
    logger.error(`sendGiftNotification fallback error for ${discordId}: ${fallbackError}`);
  }
}