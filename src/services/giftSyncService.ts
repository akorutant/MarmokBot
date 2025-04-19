import { AppDataSource } from "./database.js";
import { User } from "../entities/User.js";
import { GiftStats } from "../entities/GiftStats.js";
import logger from "./logger.js";

export class GiftSyncService {
  private static instance: GiftSyncService;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 30 * 60 * 1000; 

  private constructor() {
    this.initialize();
  }


  public static getInstance(): GiftSyncService {
    if (!GiftSyncService.instance) {
      GiftSyncService.instance = new GiftSyncService();
    }
    return GiftSyncService.instance;
  }

  private initialize(): void {
    logger.info("Инициализация GiftSyncService");
    this.startSyncInterval();
  }


  private startSyncInterval(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    this.syncIntervalId = setInterval(() => {
      this.syncVoiceTimeWithGiftStats().catch(error => {
        logger.error("Ошибка при синхронизации времени в голосовом канале:", error);
      });
    }, this.SYNC_INTERVAL_MS);

    logger.info(`GiftSyncService: запущена периодическая синхронизация с интервалом ${this.SYNC_INTERVAL_MS / 60000} минут`);
  }


  public stopSyncInterval(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      logger.info("GiftSyncService: периодическая синхронизация остановлена");
    }
  }

  public async syncVoiceTimeWithGiftStats(): Promise<void> {
    try {
      logger.info("Начало синхронизации времени в голосовом канале с таблицей GiftStats");
      
      const userRepository = AppDataSource.getRepository(User);
      const giftStatsRepository = AppDataSource.getRepository(GiftStats);
      
      const allUsers = await userRepository.find();
      logger.info(`Найдено ${allUsers.length} пользователей для синхронизации`);
      
      let syncCount = 0;
      let createdCount = 0;
      
      for (const user of allUsers) {
        let giftStats = await giftStatsRepository.findOne({
          where: { discordId: user.discordId }
        });
        
        if (!giftStats) {
          giftStats = giftStatsRepository.create({
            discordId: user.discordId,
            userId: user.id,
            user: user,
            trackedVoiceMinutes: user.voiceMinutes,
            claimedGiftsFromVoice: 0,
          });
          
          await giftStatsRepository.save(giftStats);
          createdCount++;
        } else {
          const currentVoiceMinutes = user.voiceMinutes;
          const trackedVoiceMinutes = giftStats.trackedVoiceMinutes;
          
          if (currentVoiceMinutes > trackedVoiceMinutes) {
            giftStats.trackedVoiceMinutes = currentVoiceMinutes;
            await giftStatsRepository.save(giftStats);
            syncCount++;
          }
        }
      }
      
      logger.info(`Синхронизация завершена. Обновлено: ${syncCount}, Создано: ${createdCount}`);
    } catch (error) {
      logger.error("Ошибка при синхронизации времени в голосовом канале:", error);
      throw error;
    }
  }
  
  public async forceSyncAll(): Promise<{syncCount: number, createdCount: number}> {
    try {
      logger.info("Запуск полной принудительной синхронизации");
      
      const userRepository = AppDataSource.getRepository(User);
      const giftStatsRepository = AppDataSource.getRepository(GiftStats);
      
      const allUsers = await userRepository.find();
      logger.info(`Найдено ${allUsers.length} пользователей для принудительной синхронизации`);
      
      let syncCount = 0;
      let createdCount = 0;
      
      for (const user of allUsers) {
        let giftStats = await giftStatsRepository.findOne({
          where: { discordId: user.discordId }
        });
        
        if (!giftStats) {
          giftStats = giftStatsRepository.create({
            discordId: user.discordId,
            userId: user.id,
            user: user,
            trackedVoiceMinutes: user.voiceMinutes,
            claimedGiftsFromVoice: 0
          });
          
          await giftStatsRepository.save(giftStats);
          createdCount++;
        } else {
          giftStats.trackedVoiceMinutes = user.voiceMinutes;
          await giftStatsRepository.save(giftStats);
          syncCount++;
        }
      }
      
      logger.info(`Принудительная синхронизация завершена. Обновлено: ${syncCount}, Создано: ${createdCount}`);
      return { syncCount, createdCount };
    } catch (error) {
      logger.error("Ошибка при принудительной синхронизации:", error);
      throw error;
    }
  }
}

export const giftSyncService = GiftSyncService.getInstance();