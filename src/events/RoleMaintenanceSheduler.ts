import { RoleShopService } from "../services/RoleShopService.js";
import { AppDataSource } from "../services/database.js";
import { Inventory, InventoryItemType, InventoryItemStatus } from "../entities/Inventory.js";
import { RoleSharing, SharingStatus } from "../entities/RoleSharing.js";
import { User } from "../entities/User.js";
import logger from "../services/logger.js";
import { Client, Guild, Role } from "discord.js";

export class RoleMaintenanceScheduler {
  private static instance: RoleMaintenanceScheduler;
  private client: Client;
  private roleShopService: RoleShopService;
  private isRunning: boolean = false;
  
  // Интервалы проверок (в миллисекундах)
  private readonly CHECK_INTERVAL = 60 * 60 * 1000; // 1 час
  private readonly NOTIFICATION_HOURS = [9, 15, 21]; // Часы для уведомлений
  
  constructor(client: Client) {
    this.client = client;
    this.roleShopService = RoleShopService.getInstance();
  }

  public static getInstance(client: Client): RoleMaintenanceScheduler {
    if (!RoleMaintenanceScheduler.instance) {
      RoleMaintenanceScheduler.instance = new RoleMaintenanceScheduler(client);
    }
    return RoleMaintenanceScheduler.instance;
  }

  // Запуск планировщика
  public start(): void {
    if (this.isRunning) {
      logger.warn("Role maintenance scheduler is already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting role maintenance scheduler");

    // Проверяем сразу при запуске
    this.runMaintenance();

    // Запускаем регулярные проверки
    setInterval(() => {
      this.runMaintenance();
    }, this.CHECK_INTERVAL);
  }

  // Остановка планировщика
  public stop(): void {
    this.isRunning = false;
    logger.info("Role maintenance scheduler stopped");
  }

  // Основная функция maintenance
  private async runMaintenance(): Promise<void> {
    try {
      logger.info("Running role maintenance check");

      await Promise.all([
        this.checkExpiredRoles(),
        this.checkExpiredAuctions(),
        this.syncDiscordRoles(),
        this.sendMaintenanceNotifications()
      ]);

      logger.info("Role maintenance check completed");

    } catch (error) {
      logger.error("Error during role maintenance:", error);
    }
  }

  // Проверка просроченных ролей
  private async checkExpiredRoles(): Promise<void> {
    try {
      const now = new Date();
      
      const expiredRoles = await AppDataSource.getRepository(Inventory).find({
        where: {
          itemType: InventoryItemType.CUSTOM_ROLE,
          status: InventoryItemStatus.ACTIVE
        },
        relations: ["user"]
      });

      for (const role of expiredRoles) {
        if (role.nextMaintenanceDate && role.nextMaintenanceDate < now) {
          await this.suspendRole(role);
        }
      }

    } catch (error) {
      logger.error("Error checking expired roles:", error);
    }
  }

  // Приостановка роли
  private async suspendRole(role: Inventory): Promise<void> {
    try {
      await AppDataSource.transaction(async (manager) => {
        // Обновляем статус роли
        await manager.update(Inventory, 
          { id: role.id },
          { status: InventoryItemStatus.SUSPENDED }
        );

        // Убираем все расшаривания
        await manager.update(RoleSharing,
          { inventoryId: role.id },
          { 
            status: SharingStatus.EXPIRED,
            revokedDate: new Date()
          }
        );

        // Убираем роль с Discord сервера
        await this.removeDiscordRole(role);

        logger.info(`Role ${role.id} (${role.itemData?.roleName}) suspended due to missed payment`);
      });

      // Отправляем уведомление владельцу
      await this.sendSuspensionNotification(role);

    } catch (error) {
      logger.error(`Error suspending role ${role.id}:`, error);
    }
  }

  // Проверка завершенных аукционов
  private async checkExpiredAuctions(): Promise<void> {
    try {
      const activeAuctions = await this.roleShopService.getActiveAuctions();
      const now = new Date();

      for (const auction of activeAuctions) {
        const auctionData = auction.itemData?.auctionData;
        if (auctionData && new Date(auctionData.endTime) < now) {
          await this.roleShopService.completeAuction(auction.id);
          logger.info(`Auction ${auction.id} completed automatically`);
        }
      }

    } catch (error) {
      logger.error("Error checking expired auctions:", error);
    }
  }

  // Синхронизация ролей с Discord
  private async syncDiscordRoles(): Promise<void> {
    try {
      const guilds = this.client.guilds.cache;
      
      for (const [guildId, guild] of guilds) {
        await this.syncGuildRoles(guild);
      }

    } catch (error) {
      logger.error("Error syncing Discord roles:", error);
    }
  }

  // Синхронизация ролей конкретного сервера
  private async syncGuildRoles(guild: Guild): Promise<void> {
    try {
      // Получаем все активные роли из базы
      const activeRoles = await AppDataSource.getRepository(Inventory).find({
        where: {
          itemType: InventoryItemType.CUSTOM_ROLE,
          status: InventoryItemStatus.ACTIVE
        },
        relations: ["user"]
      });

      // Получаем расшаривания
      const activeShares = await AppDataSource.getRepository(RoleSharing).find({
        where: { status: SharingStatus.ACTIVE },
        relations: ["inventory", "sharedWithUser"]
      });

      for (const roleData of activeRoles) {
        await this.ensureDiscordRole(guild, roleData, activeShares);
      }

      // Убираем роли для приостановленных/проданных ролей
      await this.cleanupSuspendedRoles(guild);

    } catch (error) {
      logger.error(`Error syncing roles for guild ${guild.id}:`, error);
    }
  }

  // Создание или обновление роли в Discord
  private async ensureDiscordRole(guild: Guild, roleData: Inventory, shares: RoleSharing[]): Promise<void> {
    try {
      const roleName = roleData.itemData?.roleName;
      const roleColor = roleData.itemData?.roleColor;
      
      if (!roleName || !roleColor) {
        logger.warn(`Invalid role data for inventory ${roleData.id}`);
        return;
      }

      // Ищем существующую роль
      let discordRole = guild.roles.cache.find(r => r.name === roleName);

      if (!discordRole) {
        // Создаем новую роль
        discordRole = await guild.roles.create({
          name: roleName,
          color: parseInt(roleColor.replace('#', ''), 16),
          reason: `Custom role created by role shop system`
        });

        // Сохраняем ID роли в базе
        await AppDataSource.getRepository(Inventory).update(
          { id: roleData.id },
          {
            itemData: {
              ...roleData.itemData,
              discordRoleId: discordRole.id
            }
          }
        );

        logger.info(`Created Discord role ${discordRole.id} for inventory ${roleData.id}`);
      }

      // Назначаем роль владельцу
      const ownerMember = await guild.members.fetch(roleData.user.discordId).catch(() => null);
      if (ownerMember && !ownerMember.roles.cache.has(discordRole.id)) {
        await ownerMember.roles.add(discordRole);
      }

      // Назначаем роль всем, кому она расшарена
      const roleShares = shares.filter(s => s.inventory.id === roleData.id);
      for (const share of roleShares) {
        const sharedMember = await guild.members.fetch(share.sharedWithUser.discordId).catch(() => null);
        if (sharedMember && !sharedMember.roles.cache.has(discordRole.id)) {
          await sharedMember.roles.add(discordRole);
        }
      }

    } catch (error) {
      logger.error(`Error ensuring Discord role for inventory ${roleData.id}:`, error);
    }
  }

  // Удаление роли из Discord
  private async removeDiscordRole(roleData: Inventory): Promise<void> {
    try {
      const discordRoleId = roleData.itemData?.discordRoleId;
      if (!discordRoleId) return;

      const guilds = this.client.guilds.cache;
      
      for (const [guildId, guild] of guilds) {
        const discordRole = guild.roles.cache.get(discordRoleId);
        if (discordRole) {
          // Убираем роль у всех пользователей
          const members = guild.members.cache.filter(m => m.roles.cache.has(discordRoleId));
          for (const [memberId, member] of members) {
            await member.roles.remove(discordRole).catch(() => {});
          }
        }
      }

    } catch (error) {
      logger.error(`Error removing Discord role for inventory ${roleData.id}:`, error);
    }
  }

  // Очистка приостановленных ролей
  private async cleanupSuspendedRoles(guild: Guild): Promise<void> {
    try {
      const suspendedRoles = await AppDataSource.getRepository(Inventory).find({
        where: {
          itemType: InventoryItemType.CUSTOM_ROLE,
          status: InventoryItemStatus.SUSPENDED
        }
      });

      for (const roleData of suspendedRoles) {
        const discordRoleId = roleData.itemData?.discordRoleId;
        if (discordRoleId) {
          const discordRole = guild.roles.cache.get(discordRoleId);
          if (discordRole) {
            // Убираем роль у всех пользователей
            const members = guild.members.cache.filter(m => m.roles.cache.has(discordRoleId));
            for (const [memberId, member] of members) {
              await member.roles.remove(discordRole).catch(() => {});
            }
          }
        }
      }

    } catch (error) {
      logger.error(`Error cleaning up suspended roles for guild ${guild.id}:`, error);
    }
  }

  // Отправка уведомлений о необходимости оплаты
  private async sendMaintenanceNotifications(): Promise<void> {
    try {
      const currentHour = new Date().getHours();
      if (!this.NOTIFICATION_HOURS.includes(currentHour)) {
        return; // Уведомления только в определенные часы
      }

      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);

      const upcomingPayments = await AppDataSource.getRepository(Inventory).find({
        where: {
          itemType: InventoryItemType.CUSTOM_ROLE,
          status: InventoryItemStatus.ACTIVE
        },
        relations: ["user"]
      });

      for (const role of upcomingPayments) {
        if (!role.nextMaintenanceDate) continue;

        const daysUntilPayment = Math.floor(
          (role.nextMaintenanceDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );

        if (daysUntilPayment === 3 || daysUntilPayment === 1) {
          await this.sendPaymentReminder(role, daysUntilPayment);
        }
      }

    } catch (error) {
      logger.error("Error sending maintenance notifications:", error);
    }
  }

  // Отправка напоминания об оплате
  private async sendPaymentReminder(role: Inventory, daysUntilPayment: number): Promise<void> {
    try {
      const user = await this.client.users.fetch(role.user.discordId).catch(() => null);
      if (!user) return;

      const roleName = role.itemData?.roleName || "Неизвестная роль";
      const maintenanceCost = role.itemData?.maintenanceCost || 1000;
      
      const urgencyEmoji = daysUntilPayment === 1 ? "🚨" : "⚠️";
      const urgencyText = daysUntilPayment === 1 ? "завтра" : `через ${daysUntilPayment} дня`;

      const message = 
        `${urgencyEmoji} **Напоминание об оплате роли**\n\n` +
        `Роль: **${roleName}**\n` +
        `Оплата ${urgencyText}: **${maintenanceCost}$**\n\n` +
        `Используйте команду: \`/roleshop pay ${roleName}\`\n\n` +
        `⚠️ Если не оплатить вовремя, роль будет снята с вас и всех пользователей.`;

      await user.send(message).catch(() => {
        logger.warn(`Failed to send payment reminder to user ${role.user.discordId}`);
      });

      logger.info(`Payment reminder sent to user ${role.user.discordId} for role ${role.id}`);

    } catch (error) {
      logger.error(`Error sending payment reminder for role ${role.id}:`, error);
    }
  }

  // Отправка уведомления о приостановке роли
  private async sendSuspensionNotification(role: Inventory): Promise<void> {
    try {
      const user = await this.client.users.fetch(role.user.discordId).catch(() => null);
      if (!user) return;

      const roleName = role.itemData?.roleName || "Неизвестная роль";
      const maintenanceCost = role.itemData?.maintenanceCost || 1000;

      const message = 
        `🚨 **Роль приостановлена**\n\n` +
        `Роль **${roleName}** была приостановлена из-за неоплаты поддержки.\n\n` +
        `💰 Для восстановления оплатите: **${maintenanceCost}$**\n` +
        `Команда: \`/roleshop pay ${roleName}\`\n\n` +
        `❌ Роль снята с вас и всех пользователей до оплаты.`;

      await user.send(message).catch(() => {
        logger.warn(`Failed to send suspension notification to user ${role.user.discordId}`);
      });

      logger.info(`Suspension notification sent to user ${role.user.discordId} for role ${role.id}`);

    } catch (error) {
      logger.error(`Error sending suspension notification for role ${role.id}:`, error);
    }
  }

  // Ручная синхронизация всех ролей (для админов)
  public async forceSyncAllRoles(): Promise<{
    rolesProcessed: number;
    rolesCreated: number;
    rolesSynced: number;
    errors: number;
  }> {
    const stats = {
      rolesProcessed: 0,
      rolesCreated: 0,
      rolesSynced: 0,
      errors: 0
    };

    try {
      logger.info("Starting forced sync of all roles");

      const guilds = this.client.guilds.cache;
      
      for (const [guildId, guild] of guilds) {
        try {
          await this.syncGuildRoles(guild);
          stats.rolesSynced++;
        } catch (error) {
          logger.error(`Error syncing guild ${guildId}:`, error);
          stats.errors++;
        }
      }

      logger.info("Forced sync completed", stats);
      return stats;

    } catch (error) {
      logger.error("Error during forced sync:", error);
      stats.errors++;
      return stats;
    }
  }

  // Получение статистики ролей
  public async getRoleStats(): Promise<{
    activeRoles: number;
    suspendedRoles: number;
    auctionRoles: number;
    soldSlots: number;
    totalShares: number;
    upcomingPayments: number;
  }> {
    try {
      const inventoryRepo = AppDataSource.getRepository(Inventory);
      const sharingRepo = AppDataSource.getRepository(RoleSharing);

      const [
        activeRoles,
        suspendedRoles,
        auctionRoles,
        soldSlots,
        totalShares
      ] = await Promise.all([
        inventoryRepo.count({
          where: {
            itemType: InventoryItemType.CUSTOM_ROLE,
            status: InventoryItemStatus.ACTIVE
          }
        }),
        inventoryRepo.count({
          where: {
            itemType: InventoryItemType.CUSTOM_ROLE,
            status: InventoryItemStatus.SUSPENDED
          }
        }),
        inventoryRepo.count({
          where: {
            itemType: InventoryItemType.CUSTOM_ROLE,
            status: InventoryItemStatus.TRANSFERRING
          }
        }),
        inventoryRepo.count({
          where: {
            itemType: InventoryItemType.CUSTOM_ROLE,
            status: InventoryItemStatus.SOLD
          }
        }),
        sharingRepo.count({
          where: { status: SharingStatus.ACTIVE }
        })
      ]);

      // Подсчет предстоящих платежей (в ближайшие 7 дней)
      const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const upcomingPayments = await inventoryRepo.count({
        where: {
          itemType: InventoryItemType.CUSTOM_ROLE,
          status: InventoryItemStatus.ACTIVE
        }
      });

      return {
        activeRoles,
        suspendedRoles,
        auctionRoles,
        soldSlots,
        totalShares,
        upcomingPayments
      };

    } catch (error) {
      logger.error("Error getting role stats:", error);
      return {
        activeRoles: 0,
        suspendedRoles: 0,
        auctionRoles: 0,
        soldSlots: 0,
        totalShares: 0,
        upcomingPayments: 0
      };
    }
  }

  // Очистка старых записей истории (старше 3 месяцев)
  public async cleanupOldHistory(): Promise<number> {
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const result = await AppDataSource
        .createQueryBuilder()
        .delete()
        .from("inventory_history")
        .where("actionDate < :date", { date: threeMonthsAgo })
        .execute();

      const deletedRows = result.affected || 0;
      logger.info(`Cleaned up ${deletedRows} old history records`);
      
      return deletedRows;

    } catch (error) {
      logger.error("Error cleaning up old history:", error);
      return 0;
    }
  }

  // Проверка здоровья системы
  public async healthCheck(): Promise<{
    isHealthy: boolean;
    checks: Record<string, boolean>;
    lastRun?: Date;
  }> {
    const checks: Record<string, boolean> = {};

    try {
      // Проверка подключения к базе данных
      checks.database = AppDataSource.isInitialized;

      // Проверка подключения к Discord
      checks.discord = this.client.isReady();

      // Проверка наличия критичных таблиц
      try {
        await AppDataSource.getRepository(Inventory).findOne({
          where: { id: 1 }
        });
        checks.inventoryTable = true;
      } catch {
        checks.inventoryTable = false;
      }

      // Проверка работы планировщика
      checks.scheduler = this.isRunning;

      const isHealthy = Object.values(checks).every(check => check);

      return {
        isHealthy,
        checks,
        lastRun: new Date()
      };

    } catch (error) {
      logger.error("Error during health check:", error);
      return {
        isHealthy: false,
        checks,
        lastRun: new Date()
      };
    }
  }
}