import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { GiftStats } from "../entities/GiftStats.js";
import logger from "../services/logger.js";

/**
 * Сервис для периодической синхронизации времени в голосовом канале
 * с таблицей GiftStats для предотвращения абуза подарков
 */
export class GiftSyncService {
  private static instance: GiftSyncService;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 30 * 60 * 1000; // Синхронизация каждые 30 минут

  private constructor() {
    this.initialize();
  }

  /**
   * Получить экземпляр сервиса (Singleton pattern)
   */
  public static getInstance(): GiftSyncService {
    if (!GiftSyncService.instance) {
      GiftSyncService.instance = new GiftSyncService();
    }
    return GiftSyncService.instance;
  }

  /**
   * Инициализация сервиса и запуск периодической синхронизации
   */
  private initialize(): void {
    logger.info("Инициализация GiftSyncService");
    this.startSyncInterval();
  }

  /**
   * Запуск периодической синхронизации
   */
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

  /**
   * Остановка периодической синхронизации
   */
  public stopSyncInterval(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      logger.info("GiftSyncService: периодическая синхронизация остановлена");
    }
  }

  /**
   * Синхронизация времени в голосовом канале с таблицей GiftStats
   */
  public async syncVoiceTimeWithGiftStats(): Promise<void> {
    try {
      logger.info("Начало синхронизации времени в голосовом канале с таблицей GiftStats");
      
      // Получаем всех пользователей
      const userRepository = AppDataSource.getRepository(User);
      const giftStatsRepository = AppDataSource.getRepository(GiftStats);
      
      const allUsers = await userRepository.find();
      logger.info(`Найдено ${allUsers.length} пользователей для синхронизации`);
      
      let syncCount = 0;
      let createdCount = 0;
      
      for (const user of allUsers) {
        // Проверяем, есть ли запись в GiftStats для этого пользователя
        let giftStats = await giftStatsRepository.findOne({
          where: { discordId: user.discordId }
        });
        
        if (!giftStats) {
          // Если записи нет, создаем новую
          giftStats = giftStatsRepository.create({
            discordId: user.discordId,
            userId: user.id,
            user: user,
            trackedVoiceMinutes: user.voiceMinutes,
            claimedGiftsFromVoice: 0, // Для новых пользователей учитываем только текущее время
          });
          
          await giftStatsRepository.save(giftStats);
          createdCount++;
        } else {
          // Если запись есть, проверяем, не увеличилось ли время в голосовом канале больше, чем отслеживается
          const currentVoiceMinutes = user.voiceMinutes;
          const trackedVoiceMinutes = giftStats.trackedVoiceMinutes;
          
          // Если текущее время больше отслеживаемого, обновляем trackedVoiceMinutes
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
  
  /**
   * Запускает полную принудительную синхронизацию
   */
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