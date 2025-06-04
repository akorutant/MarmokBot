import { AppDataSource } from "../services/database.js";
import { Inventory, InventoryItemType, InventoryItemStatus } from "../entities/Inventory.js";
import { RoleSharing, SharingStatus } from "../entities/RoleSharing.js";
import { InventoryHistory, InventoryActionType } from "../entities/InventoryHistory.js";
import { ShopConfig, ShopItemType } from "../entities/ShopConfig.js";
import { User } from "../entities/User.js";
import { Currency } from "../entities/Currency.js";
import logger from "../services/logger.js";

export class RoleShopService {
  private static instance: RoleShopService;
  
  public static getInstance(): RoleShopService {
    if (!RoleShopService.instance) {
      RoleShopService.instance = new RoleShopService();
    }
    return RoleShopService.instance;
  }

  // Покупка слота для роли
  async purchaseRoleSlot(userId: number, roleName: string, roleColor: string): Promise<{
    success: boolean;
    message: string;
    inventoryItem?: Inventory;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        // Получаем конфиг магазина
        const shopConfig = await manager.findOne(ShopConfig, {
          where: { itemType: ShopItemType.ROLE_SLOT }
        });

        if (!shopConfig || !shopConfig.isEnabled) {
          return { success: false, message: "Магазин ролей временно недоступен" };
        }

        // Проверяем, есть ли уже роль с таким именем
        const existingRole = await manager.findOne(Inventory, {
          where: { 
            itemType: InventoryItemType.CUSTOM_ROLE,
            itemData: { roleName } as any
          }
        });

        if (existingRole) {
          return { success: false, message: "Роль с таким именем уже существует" };
        }

        // Проверяем баланс пользователя
        const user = await manager.findOne(User, {
          where: { id: userId },
          relations: ["currency"]
        });

        if (!user || user.currency.currencyCount < shopConfig.price) {
          return { 
            success: false, 
            message: `Недостаточно средств. Требуется: ${shopConfig.price}$` 
          };
        }

        // Списываем деньги
        await manager.update(Currency, 
          { id: user.currency.id },
          { currencyCount: user.currency.currencyCount - shopConfig.price }
        );

        // Создаем слот роли
        const now = new Date();
        const nextMaintenance = new Date(now.getTime() + shopConfig.maintenanceDays * 24 * 60 * 60 * 1000);

        const inventoryItem = manager.create(Inventory, {
          userId,
          itemType: InventoryItemType.CUSTOM_ROLE,
          status: InventoryItemStatus.ACTIVE,
          itemIdentifier: roleName.toLowerCase().replace(/\s+/g, '_'),
          itemData: {
            roleName,
            roleColor,
            originalCreator: userId,
            purchasePrice: Number(shopConfig.price),
            maintenanceCost: Number(shopConfig.price) // Или другая формула
          },
          purchaseDate: now,
          lastMaintenanceDate: now,
          nextMaintenanceDate: nextMaintenance
        });

        const savedItem = await manager.save(inventoryItem);

        // Записываем в историю
        await this.addToHistory(manager, {
          inventoryId: savedItem.id,
          actionType: InventoryActionType.PURCHASE,
          userId,
          amount: shopConfig.price,
          actionData: { roleName, roleColor },
          details: `Приобретен слот для роли "${roleName}"`
        });

        return { 
          success: true, 
          message: `Роль "${roleName}" успешно приобретена!`,
          inventoryItem: savedItem
        };

      } catch (error) {
        logger.error("Error purchasing role slot:", error);
        return { success: false, message: "Ошибка при покупке роли" };
      }
    });
  }

  // Оплата поддержки роли
  async payRoleMaintenance(userId: number, inventoryId: number): Promise<{
    success: boolean;
    message: string;
    nextPaymentDate?: Date;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        const inventory = await manager.findOne(Inventory, {
          where: { 
            id: inventoryId, 
            userId,
            itemType: InventoryItemType.CUSTOM_ROLE
          },
          relations: ["user", "user.currency"]
        });

        if (!inventory) {
          return { success: false, message: "Роль не найдена" };
        }

        const maintenanceCost = BigInt(inventory.itemData?.maintenanceCost || 1000);
        
        if (inventory.user.currency.currencyCount < maintenanceCost) {
          return { 
            success: false, 
            message: `Недостаточно средств для оплаты поддержки. Требуется: ${maintenanceCost}$` 
          };
        }

        // Списываем деньги
        await manager.update(Currency,
          { id: inventory.user.currency.id },
          { currencyCount: inventory.user.currency.currencyCount - maintenanceCost }
        );

        // Обновляем дату следующей оплаты
        const shopConfig = await manager.findOne(ShopConfig, {
          where: { itemType: ShopItemType.ROLE_MAINTENANCE }
        });

        const days = shopConfig?.maintenanceDays || 14;
        const nextPayment = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        await manager.update(Inventory, 
          { id: inventoryId },
          { 
            status: InventoryItemStatus.ACTIVE,
            lastMaintenanceDate: new Date(),
            nextMaintenanceDate: nextPayment
          }
        );

        // Записываем в историю
        await this.addToHistory(manager, {
          inventoryId,
          actionType: InventoryActionType.MAINTENANCE_PAID,
          userId,
          amount: maintenanceCost,
          details: `Оплачена поддержка роли "${inventory.itemData?.roleName}"`
        });

        return { 
          success: true, 
          message: "Поддержка роли оплачена!",
          nextPaymentDate: nextPayment
        };

      } catch (error) {
        logger.error("Error paying role maintenance:", error);
        return { success: false, message: "Ошибка при оплате поддержки" };
      }
    });
  }

  // Поделиться ролью с пользователем
  async shareRole(ownerId: number, inventoryId: number, targetUserId: number): Promise<{
    success: boolean;
    message: string;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        const inventory = await manager.findOne(Inventory, {
          where: { 
            id: inventoryId, 
            userId: ownerId,
            status: InventoryItemStatus.ACTIVE
          }
        });

        if (!inventory) {
          return { success: false, message: "Роль не найдена или неактивна" };
        }

        // Проверяем лимит расшаривания
        const currentShares = await manager.count(RoleSharing, {
          where: { 
            inventoryId, 
            status: SharingStatus.ACTIVE 
          }
        });

        const shopConfig = await manager.findOne(ShopConfig, {
          where: { itemType: ShopItemType.ROLE_SLOT }
        });

        const maxShares = shopConfig?.maxSharingSlots || 2;

        if (currentShares >= maxShares) {
          return { success: false, message: `Максимум ${maxShares} пользователей могут носить роль` };
        }

        // Проверяем, не расшарена ли уже этому пользователю
        const existingShare = await manager.findOne(RoleSharing, {
          where: { 
            inventoryId, 
            sharedWithUserId: targetUserId,
            status: SharingStatus.ACTIVE
          }
        });

        if (existingShare) {
          return { success: false, message: "Роль уже расшарена этому пользователю" };
        }

        // Создаем запись о расшаривании
        const roleShare = manager.create(RoleSharing, {
          inventoryId,
          ownerId,
          sharedWithUserId: targetUserId,
          status: SharingStatus.ACTIVE
        });

        await manager.save(roleShare);

        // Записываем в историю
        await this.addToHistory(manager, {
          inventoryId,
          actionType: InventoryActionType.SHARED,
          userId: ownerId,
          targetUserId,
          actionData: { roleName: inventory.itemData?.roleName },
          details: `Роль расшарена пользователю ${targetUserId}`
        });

        return { success: true, message: "Роль успешно расшарена!" };

      } catch (error) {
        logger.error("Error sharing role:", error);
        return { success: false, message: "Ошибка при расшаривании роли" };
      }
    });
  }

  // Начать аукцион роли
  async startRoleAuction(userId: number, inventoryId: number, startingBid: number, durationDays: number): Promise<{
    success: boolean;
    message: string;
    auctionEndTime?: Date;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        const inventory = await manager.findOne(Inventory, {
          where: { 
            id: inventoryId, 
            userId,
            status: InventoryItemStatus.ACTIVE
          }
        });

        if (!inventory) {
          return { success: false, message: "Роль не найдена или неактивна" };
        }

        const shopConfig = await manager.findOne(ShopConfig, {
          where: { itemType: ShopItemType.ROLE_SLOT }
        });

        const maxDays = shopConfig?.auctionMaxDays || 7;
        if (durationDays > maxDays) {
          return { success: false, message: `Максимальная длительность аукциона: ${maxDays} дней` };
        }

        const endTime = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

        // Обновляем инвентарь
        const auctionData = {
          ...inventory.itemData,
          auctionData: {
            startTime: new Date(),
            endTime,
            startingBid,
            currentBid: startingBid,
            currentBidder: null,
            isActive: true
          }
        };

        await manager.update(Inventory,
          { id: inventoryId },
          { 
            status: InventoryItemStatus.TRANSFERRING,
            itemData: auctionData
          }
        );

        // Записываем в историю
        await this.addToHistory(manager, {
          inventoryId,
          actionType: InventoryActionType.AUCTION_STARTED,
          userId,
          actionData: { 
            roleName: inventory.itemData?.roleName,
            auctionDuration: durationDays,
            bidAmount: startingBid
          },
          details: `Начат аукцион роли "${inventory.itemData?.roleName}"`
        });

        return { 
          success: true, 
          message: "Аукцион роли запущен!",
          auctionEndTime: endTime
        };

      } catch (error) {
        logger.error("Error starting role auction:", error);
        return { success: false, message: "Ошибка при запуске аукциона" };
      }
    });
  }

  // Сделать ставку на аукционе
  async placeBid(userId: number, inventoryId: number, bidAmount: number): Promise<{
    success: boolean;
    message: string;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        const inventory = await manager.findOne(Inventory, {
          where: { 
            id: inventoryId,
            status: InventoryItemStatus.TRANSFERRING
          },
          relations: ["user", "user.currency"]
        });

        if (!inventory) {
          return { success: false, message: "Аукцион не найден" };
        }

        const auctionData = inventory.itemData?.auctionData;
        if (!auctionData || !auctionData.isActive || new Date() > new Date(auctionData.endTime)) {
          return { success: false, message: "Аукцион завершен или неактивен" };
        }

        if (bidAmount <= auctionData.currentBid) {
          return { success: false, message: `Ставка должна быть больше ${auctionData.currentBid}$` };
        }

        // Проверяем баланс
        const bidder = await manager.findOne(User, {
          where: { id: userId },
          relations: ["currency"]
        });

        if (!bidder || bidder.currency.currencyCount < BigInt(bidAmount)) {
          return { success: false, message: "Недостаточно средств для ставки" };
        }

        // Обновляем данные аукциона
        const updatedAuctionData = {
          ...inventory.itemData,
          auctionData: {
            ...auctionData,
            currentBid: bidAmount,
            currentBidder: userId
          }
        };

        await manager.update(Inventory,
          { id: inventoryId },
          { itemData: updatedAuctionData }
        );

        // Записываем в историю
        await this.addToHistory(manager, {
          inventoryId,
          actionType: InventoryActionType.AUCTION_BID,
          userId,
          actionData: { 
            roleName: inventory.itemData?.roleName,
            bidAmount
          },
          details: `Ставка ${bidAmount}$ на роль "${inventory.itemData?.roleName}"`
        });

        return { success: true, message: "Ставка размещена!" };

      } catch (error) {
        logger.error("Error placing bid:", error);
        return { success: false, message: "Ошибка при размещении ставки" };
      }
    });
  }

  // Завершить аукцион
  async completeAuction(inventoryId: number): Promise<{
    success: boolean;
    message: string;
    winner?: number;
    finalPrice?: number;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        const inventory = await manager.findOne(Inventory, {
          where: { 
            id: inventoryId,
            status: InventoryItemStatus.TRANSFERRING
          }
        });

        if (!inventory) {
          return { success: false, message: "Аукцион не найден" };
        }

        const auctionData = inventory.itemData?.auctionData;
        if (!auctionData) {
          return { success: false, message: "Данные аукциона не найдены" };
        }

        const winner = auctionData.currentBidder;
        const finalPrice = auctionData.currentBid;

        if (winner) {
          // Передаем роль победителю
          await this.transferRoleOwnership(manager, inventoryId, winner, finalPrice);
        } else {
          // Никто не участвовал, возвращаем роль владельцу
          await manager.update(Inventory,
            { id: inventoryId },
            { 
              status: InventoryItemStatus.ACTIVE,
              itemData: {
                ...inventory.itemData,
                auctionData: undefined
              }
            }
          );
        }

        return { 
          success: true, 
          message: winner ? "Аукцион завершен!" : "Аукцион завершен без участников",
          winner,
          finalPrice
        };

      } catch (error) {
        logger.error("Error completing auction:", error);
        return { success: false, message: "Ошибка при завершении аукциона" };
      }
    });
  }

  // Вспомогательная функция для передачи владения ролью
  private async transferRoleOwnership(manager: any, inventoryId: number, newOwnerId: number, price: number): Promise<void> {
    const inventory = await manager.findOne(Inventory, {
      where: { id: inventoryId },
      relations: ["user", "user.currency"]
    });

    if (!inventory) throw new Error("Inventory not found");

    const oldOwnerId = inventory.userId;

    // Списываем деньги у покупателя
    const buyer = await manager.findOne(User, {
      where: { id: newOwnerId },
      relations: ["currency"]
    });

    if (!buyer) throw new Error("Buyer not found");

    await manager.update(Currency,
      { id: buyer.currency.id },
      { currencyCount: buyer.currency.currencyCount - BigInt(price) }
    );

    // Зачисляем деньги продавцу
    await manager.update(Currency,
      { id: inventory.user.currency.id },
      { currencyCount: inventory.user.currency.currencyCount + BigInt(price) }
    );

    // Убираем все расшаривания текущей роли
    await manager.update(RoleSharing,
      { inventoryId },
      { 
        status: SharingStatus.REVOKED,
        revokedDate: new Date()
      }
    );

    // Передаем владение
    await manager.update(Inventory,
      { id: inventoryId },
      { 
        userId: newOwnerId,
        status: InventoryItemStatus.ACTIVE,
        itemData: {
          ...inventory.itemData,
          auctionData: undefined
        }
      }
    );

    // Записываем в историю
    await this.addToHistory(manager, {
      inventoryId,
      actionType: InventoryActionType.TRANSFER_COMPLETED,
      userId: oldOwnerId,
      targetUserId: newOwnerId,
      amount: BigInt(price),
      actionData: { 
        roleName: inventory.itemData?.roleName,
        transferPrice: price
      },
      details: `Роль "${inventory.itemData?.roleName}" передана пользователю ${newOwnerId} за ${price}$`
    });
  }

  // Продать слот роли (возврат половины стоимости)
  async sellRoleSlot(userId: number, inventoryId: number): Promise<{
    success: boolean;
    message: string;
    refundAmount?: number;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        const inventory = await manager.findOne(Inventory, {
          where: { 
            id: inventoryId, 
            userId,
            status: InventoryItemStatus.ACTIVE
          },
          relations: ["user", "user.currency"]
        });

        if (!inventory) {
          return { success: false, message: "Роль не найдена или неактивна" };
        }

        const shopConfig = await manager.findOne(ShopConfig, {
          where: { itemType: ShopItemType.ROLE_SLOT }
        });

        const refundRate = shopConfig?.slotRefundRate || 0.5;
        const purchasePrice = inventory.itemData?.purchasePrice || 0;
        const refundAmount = Math.floor(purchasePrice * refundRate);

        // Возвращаем деньги
        await manager.update(Currency,
          { id: inventory.user.currency.id },
          { currencyCount: inventory.user.currency.currencyCount + BigInt(refundAmount) }
        );

        // Убираем все расшаривания
        await manager.update(RoleSharing,
          { inventoryId },
          { 
            status: SharingStatus.REVOKED,
            revokedDate: new Date()
          }
        );

        // Помечаем слот как проданный
        await manager.update(Inventory,
          { id: inventoryId },
          { status: InventoryItemStatus.SOLD }
        );

        // Записываем в историю
        await this.addToHistory(manager, {
          inventoryId,
          actionType: InventoryActionType.SLOT_SOLD,
          userId,
          amount: BigInt(refundAmount),
          actionData: { 
            roleName: inventory.itemData?.roleName,
            refundAmount
          },
          details: `Продан слот роли "${inventory.itemData?.roleName}", возвращено ${refundAmount}$`
        });

        return { 
          success: true, 
          message: `Слот роли продан! Возвращено ${refundAmount}$`,
          refundAmount
        };

      } catch (error) {
        logger.error("Error selling role slot:", error);
        return { success: false, message: "Ошибка при продаже слота" };
      }
    });
  }

  // Убрать расшаривание роли
  async unshareRole(ownerId: number, inventoryId: number, targetUserId: number): Promise<{
    success: boolean;
    message: string;
  }> {
    return await AppDataSource.transaction(async (manager) => {
      try {
        const roleShare = await manager.findOne(RoleSharing, {
          where: { 
            inventoryId, 
            ownerId,
            sharedWithUserId: targetUserId,
            status: SharingStatus.ACTIVE
          }
        });

        if (!roleShare) {
          return { success: false, message: "Расшаривание не найдено" };
        }

        await manager.update(RoleSharing,
          { id: roleShare.id },
          { 
            status: SharingStatus.REVOKED,
            revokedDate: new Date()
          }
        );

        // Записываем в историю
        await this.addToHistory(manager, {
          inventoryId,
          actionType: InventoryActionType.UNSHARED,
          userId: ownerId,
          targetUserId,
          details: `Убрано расшаривание роли для пользователя ${targetUserId}`
        });

        return { success: true, message: "Расшаривание роли убрано!" };

      } catch (error) {
        logger.error("Error unsharing role:", error);
        return { success: false, message: "Ошибка при убирании расшаривания" };
      }
    });
  }

  // Получить роли пользователя
  async getUserRoles(userId: number): Promise<{
    ownedRoles: Inventory[];
    sharedRoles: RoleSharing[];
  }> {
    try {
      const ownedRoles = await AppDataSource.getRepository(Inventory).find({
        where: { 
          userId,
          itemType: InventoryItemType.CUSTOM_ROLE
        },
        order: { purchaseDate: "DESC" }
      });

      const sharedRoles = await AppDataSource.getRepository(RoleSharing).find({
        where: { 
          sharedWithUserId: userId,
          status: SharingStatus.ACTIVE
        },
        relations: ["inventory", "owner"],
        order: { sharedDate: "DESC" }
      });

      return { ownedRoles, sharedRoles };

    } catch (error) {
      logger.error("Error getting user roles:", error);
      return { ownedRoles: [], sharedRoles: [] };
    }
  }

  // Получить активные аукционы
  async getActiveAuctions(): Promise<Inventory[]> {
    try {
      const auctions = await AppDataSource.getRepository(Inventory).find({
        where: { 
          itemType: InventoryItemType.CUSTOM_ROLE,
          status: InventoryItemStatus.TRANSFERRING
        },
        relations: ["user"],
        order: { updatedAt: "DESC" }
      });

      // Фильтруем только активные аукционы
      return auctions.filter(auction => {
        const auctionData = auction.itemData?.auctionData;
        return auctionData && 
               auctionData.isActive && 
               new Date() < new Date(auctionData.endTime);
      });

    } catch (error) {
      logger.error("Error getting active auctions:", error);
      return [];
    }
  }

  // Проверить просроченные роли и аукционы
  async checkExpiredItems(): Promise<void> {
    try {
      await AppDataSource.transaction(async (manager) => {
        const now = new Date();

        // Проверяем просроченные роли
        const expiredRoles = await manager.find(Inventory, {
          where: { 
            itemType: InventoryItemType.CUSTOM_ROLE,
            status: InventoryItemStatus.ACTIVE
          }
        });

        for (const role of expiredRoles) {
          if (role.nextMaintenanceDate && role.nextMaintenanceDate < now) {
            // Приостанавливаем роль
            await manager.update(Inventory,
              { id: role.id },
              { status: InventoryItemStatus.SUSPENDED }
            );

            // Убираем все расшаривания
            await manager.update(RoleSharing,
              { inventoryId: role.id },
              { 
                status: SharingStatus.EXPIRED,
                revokedDate: now
              }
            );

            await this.addToHistory(manager, {
              inventoryId: role.id,
              actionType: InventoryActionType.SUSPENDED,
              userId: role.userId,
              details: `Роль "${role.itemData?.roleName}" приостановлена из-за неоплаты поддержки`
            });

            logger.info(`Role ${role.id} suspended due to missed maintenance payment`);
          }
        }

        // Проверяем завершенные аукционы
        const expiredAuctions = await manager.find(Inventory, {
          where: { 
            itemType: InventoryItemType.CUSTOM_ROLE,
            status: InventoryItemStatus.TRANSFERRING
          }
        });

        for (const auction of expiredAuctions) {
          const auctionData = auction.itemData?.auctionData;
          if (auctionData && 
              auctionData.isActive && 
              new Date(auctionData.endTime) < now) {
            
            await this.completeAuction(auction.id);
            logger.info(`Auction ${auction.id} completed automatically`);
          }
        }
      });

    } catch (error) {
      logger.error("Error checking expired items:", error);
    }
  }

  // Добавить запись в историю
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

  // Получить историю пользователя
  async getUserHistory(userId: number, limit: number = 50): Promise<InventoryHistory[]> {
    try {
      return await AppDataSource.getRepository(InventoryHistory).find({
        where: [
          { userId },
          { targetUserId: userId }
        ],
        relations: ["inventory", "user", "targetUser"],
        order: { actionDate: "DESC" },
        take: limit
      });

    } catch (error) {
      logger.error("Error getting user history:", error);
      return [];
    }
  }

  // Получить конфигурацию магазина
  async getShopConfig(): Promise<{
    roleSlotPrice?: bigint;
    maintenancePrice?: bigint;
    maintenanceDays?: number;
    maxSharingSlots?: number;
    slotRefundRate?: number;
  }> {
    try {
      const configs = await AppDataSource.getRepository(ShopConfig).find();
      
      const result: any = {};
      
      for (const config of configs) {
        if (config.itemType === ShopItemType.ROLE_SLOT) {
          result.roleSlotPrice = config.price;
          result.maintenanceDays = config.maintenanceDays;
          result.maxSharingSlots = config.maxSharingSlots;
          result.slotRefundRate = config.slotRefundRate;
        } else if (config.itemType === ShopItemType.ROLE_MAINTENANCE) {
          result.maintenancePrice = config.price;
        }
      }

      return result;

    } catch (error) {
      logger.error("Error getting shop config:", error);
      return {};
    }
  }
}