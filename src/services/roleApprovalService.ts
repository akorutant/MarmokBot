import { AppDataSource } from "./database.js";
import { RoleApproval, ApprovalStatus } from "../entities/RoleApproval.js";
import { Inventory, InventoryItemType, InventoryItemStatus } from "../entities/Inventory.js";
import { InventoryHistory, InventoryActionType } from "../entities/InventoryHistory.js";
import { User } from "../entities/User.js";
import { Currency } from "../entities/Currency.js";
import { ShopConfig, ShopItemType } from "../entities/ShopConfig.js";
import logger from "./logger.js";

export class RoleApprovalService {
  private static instance: RoleApprovalService;

  public static getInstance(): RoleApprovalService {
    if (!RoleApprovalService.instance) {
      RoleApprovalService.instance = new RoleApprovalService();
    }
    return RoleApprovalService.instance;
  }

  // Создать заявку на роль
  async createRoleRequest(
    userId: number, 
    roleName: string, 
    roleColor: string,
    metadata?: any
  ): Promise<{
    success: boolean;
    message: string;
    approvalId?: number;
  }> {
    try {
      // Проверяем, что роли с таким именем нет
      const existingRole = await AppDataSource.getRepository(Inventory).findOne({
        where: { 
          itemType: InventoryItemType.CUSTOM_ROLE,
          itemData: { roleName } as any
        }
      });

      if (existingRole) {
        return { success: false, message: "Роль с таким именем уже существует" };
      }

      // Проверяем активные заявки пользователя
      const pendingApproval = await AppDataSource.getRepository(RoleApproval).findOne({
        where: { 
          userId,
          status: ApprovalStatus.PENDING
        }
      });

      if (pendingApproval) {
        return { 
          success: false, 
          message: "У вас уже есть активная заявка на создание роли" 
        };
      }

      // Проверяем баланс пользователя
      const user = await AppDataSource.getRepository(User).findOne({
        where: { id: userId },
        relations: ["currency"]
      });

      if (!user) {
        return { success: false, message: "Пользователь не найден" };
      }

      const shopConfig = await AppDataSource.getRepository(ShopConfig).findOne({
        where: { itemType: ShopItemType.ROLE_SLOT }
      });

      if (!shopConfig) {
        return { success: false, message: "Конфигурация магазина не найдена" };
      }

      if (user.currency.currencyCount < shopConfig.price) {
        return { 
          success: false, 
          message: `Недостаточно средств. Требуется: ${shopConfig.price}$, у вас: ${user.currency.currencyCount}$` 
        };
      }

      // Создаем заявку
      const approval = AppDataSource.getRepository(RoleApproval).create({
        userId,
        roleName,
        roleColor,
        status: ApprovalStatus.PENDING,
        metadata: {
          ...metadata,
          originalPrice: Number(shopConfig.price),
          userBalance: Number(user.currency.currencyCount)
        }
      });

      const savedApproval = await AppDataSource.getRepository(RoleApproval).save(approval);

      logger.info(`Role approval request created: ${savedApproval.id} for user ${userId}`);

      return { 
        success: true, 
        message: "Заявка на создание роли отправлена на модерацию",
        approvalId: savedApproval.id
      };

    } catch (error) {
      logger.error("Error creating role request:", error);
      return { success: false, message: "Ошибка при создании заявки" };
    }
  }

  // Одобрить заявку
  async approveRole(
    approvalId: number, 
    moderatorId: number
  ): Promise<{
    success: boolean;
    message: string;
    inventoryItem?: Inventory;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        const approval = await manager.findOne(RoleApproval, {
          where: { id: approvalId },
          relations: ["user", "user.currency"]
        });

        if (!approval) {
          return { success: false, message: "Заявка не найдена" };
        }

        if (approval.status !== ApprovalStatus.PENDING) {
          return { success: false, message: "Заявка уже обработана" };
        }

        // Проверяем, что роли с таким именем до сих пор нет
        const existingRole = await manager.findOne(Inventory, {
          where: { 
            itemType: InventoryItemType.CUSTOM_ROLE,
            itemData: { roleName: approval.roleName } as any
          }
        });

        if (existingRole) {
          // Отклоняем заявку
          await manager.update(RoleApproval, 
            { id: approvalId },
            { 
              status: ApprovalStatus.REJECTED,
              moderatorId,
              rejectionReason: "Роль с таким именем уже создана",
              processedAt: new Date()
            }
          );
          return { success: false, message: "Роль с таким именем уже существует" };
        }

        // Проверяем баланс пользователя
        const shopConfig = await manager.findOne(ShopConfig, {
          where: { itemType: ShopItemType.ROLE_SLOT }
        });

        if (!shopConfig) {
          return { success: false, message: "Конфигурация магазина не найдена" };
        }

        if (approval.user.currency.currencyCount < shopConfig.price) {
          // Отклоняем заявку из-за недостатка средств
          await manager.update(RoleApproval,
            { id: approvalId },
            {
              status: ApprovalStatus.REJECTED,
              moderatorId,
              rejectionReason: "Недостаточно средств для покупки роли",
              processedAt: new Date()
            }
          );
          return { success: false, message: "У пользователя недостаточно средств" };
        }

        // Списываем деньги
        await manager.update(Currency,
          { id: approval.user.currency.id },
          { currencyCount: approval.user.currency.currencyCount - shopConfig.price }
        );

        // Создаем роль в инвентаре
        const now = new Date();
        const nextMaintenance = new Date(now.getTime() + shopConfig.maintenanceDays * 24 * 60 * 60 * 1000);

        const inventoryItem = manager.create(Inventory, {
          userId: approval.userId,
          itemType: InventoryItemType.CUSTOM_ROLE,
          status: InventoryItemStatus.ACTIVE,
          itemIdentifier: approval.roleName.toLowerCase().replace(/\s+/g, '_'),
          itemData: {
            roleName: approval.roleName,
            roleColor: approval.roleColor,
            originalCreator: approval.userId,
            purchasePrice: Number(shopConfig.price),
            maintenanceCost: Number(shopConfig.price)
          },
          purchaseDate: now,
          lastMaintenanceDate: now,
          nextMaintenanceDate: nextMaintenance
        });

        const savedItem = await manager.save(inventoryItem);

        // Обновляем статус заявки
        await manager.update(RoleApproval,
          { id: approvalId },
          {
            status: ApprovalStatus.APPROVED,
            moderatorId,
            processedAt: new Date()
          }
        );

        // Записываем в историю
        await this.addToHistory(manager, {
          inventoryId: savedItem.id,
          actionType: InventoryActionType.ROLE_CREATED,
          userId: approval.userId,
          targetUserId: moderatorId,
          amount: shopConfig.price,
          actionData: { 
            roleName: approval.roleName, 
            roleColor: approval.roleColor,
            approvalId 
          },
          details: `Роль "${approval.roleName}" одобрена модератором ${moderatorId}`
        });

        logger.info(`Role approved: ${approvalId} by moderator ${moderatorId}`);

        return { 
          success: true, 
          message: "Роль успешно одобрена и создана!",
          inventoryItem: savedItem
        };

      } catch (error) {
        logger.error("Error approving role:", error);
        return { success: false, message: "Ошибка при одобрении роли" };
      }
    });
  }

  // Отклонить заявку
  async rejectRole(
    approvalId: number, 
    moderatorId: number, 
    reason: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const approval = await AppDataSource.getRepository(RoleApproval).findOne({
        where: { id: approvalId }
      });

      if (!approval) {
        return { success: false, message: "Заявка не найдена" };
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        return { success: false, message: "Заявка уже обработана" };
      }

      await AppDataSource.getRepository(RoleApproval).update(
        { id: approvalId },
        {
          status: ApprovalStatus.REJECTED,
          moderatorId,
          rejectionReason: reason,
          processedAt: new Date()
        }
      );

      logger.info(`Role rejected: ${approvalId} by moderator ${moderatorId}, reason: ${reason}`);

      return { success: true, message: "Заявка отклонена" };

    } catch (error) {
      logger.error("Error rejecting role:", error);
      return { success: false, message: "Ошибка при отклонении заявки" };
    }
  }

  // Отменить заявку (пользователем)
  async cancelRequest(userId: number, approvalId: number): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const approval = await AppDataSource.getRepository(RoleApproval).findOne({
        where: { id: approvalId, userId }
      });

      if (!approval) {
        return { success: false, message: "Заявка не найдена" };
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        return { success: false, message: "Заявка уже обработана" };
      }

      await AppDataSource.getRepository(RoleApproval).update(
        { id: approvalId },
        {
          status: ApprovalStatus.CANCELLED,
          processedAt: new Date()
        }
      );

      logger.info(`Role request cancelled: ${approvalId} by user ${userId}`);

      return { success: true, message: "Заявка отменена" };

    } catch (error) {
      logger.error("Error cancelling role request:", error);
      return { success: false, message: "Ошибка при отмене заявки" };
    }
  }

  // Получить заявку по ID
  async getApproval(approvalId: number): Promise<RoleApproval | null> {
    try {
      return await AppDataSource.getRepository(RoleApproval).findOne({
        where: { id: approvalId },
        relations: ["user", "moderator"]
      });
    } catch (error) {
      logger.error("Error getting approval:", error);
      return null;
    }
  }

  // Получить активные заявки пользователя
  async getUserPendingApprovals(userId: number): Promise<RoleApproval[]> {
    try {
      return await AppDataSource.getRepository(RoleApproval).find({
        where: { 
          userId,
          status: ApprovalStatus.PENDING
        },
        order: { createdAt: "DESC" }
      });
    } catch (error) {
      logger.error("Error getting user pending approvals:", error);
      return [];
    }
  }

  // Получить все заявки на модерацию
  async getPendingApprovals(): Promise<RoleApproval[]> {
    try {
      return await AppDataSource.getRepository(RoleApproval).find({
        where: { status: ApprovalStatus.PENDING },
        relations: ["user"],
        order: { createdAt: "ASC" }
      });
    } catch (error) {
      logger.error("Error getting pending approvals:", error);
      return [];
    }
  }

  // Обновить данные сообщения модерации
  async updateModerationMessage(
    approvalId: number, 
    messageId: string, 
    channelId: string
  ): Promise<void> {
    try {
      await AppDataSource.getRepository(RoleApproval).update(
        { id: approvalId },
        { messageId, channelId }
      );
    } catch (error) {
      logger.error("Error updating moderation message:", error);
    }
  }

  // Вспомогательная функция для записи в историю
  private async addToHistory(manager: any, data: {
    inventoryId?: number | null;
    actionType: InventoryActionType;
    userId: number;
    targetUserId?: number | null;
    amount?: bigint | null;
    actionData?: any;
    details?: string | null;
  }): Promise<void> {
    const history = manager.create(InventoryHistory, {
      ...data,
      userActionDateIndex: `${data.userId}_${new Date().toISOString().split('T')[0]}`,
      inventoryActionIndex: `${data.inventoryId || 'null'}_${data.actionType}`
    });

    await manager.save(history);
  }

  // Получить статистику заявок
  async getApprovalStats(): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
  }> {
    try {
      const repo = AppDataSource.getRepository(RoleApproval);
      
      const [pending, approved, rejected, cancelled] = await Promise.all([
        repo.count({ where: { status: ApprovalStatus.PENDING } }),
        repo.count({ where: { status: ApprovalStatus.APPROVED } }),
        repo.count({ where: { status: ApprovalStatus.REJECTED } }),
        repo.count({ where: { status: ApprovalStatus.CANCELLED } })
      ]);

      return { pending, approved, rejected, cancelled };

    } catch (error) {
      logger.error("Error getting approval stats:", error);
      return { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    }
  }
}