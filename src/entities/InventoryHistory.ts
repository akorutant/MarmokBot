import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";
import { Inventory } from "./Inventory.js";

export enum InventoryActionType {
  PURCHASE = "purchase",           // Покупка слота/роли
  MAINTENANCE_PAID = "maintenance_paid",  // Оплата поддержки
  MAINTENANCE_MISSED = "maintenance_missed", // Пропуск оплаты
  TRANSFER_STARTED = "transfer_started",     // Начало передачи
  TRANSFER_COMPLETED = "transfer_completed", // Завершение передачи
  TRANSFER_CANCELLED = "transfer_cancelled", // Отмена передачи
  AUCTION_STARTED = "auction_started",       // Начало аукциона
  AUCTION_BID = "auction_bid",              // Ставка на аукционе
  AUCTION_COMPLETED = "auction_completed",   // Завершение аукциона
  AUCTION_CANCELLED = "auction_cancelled",   // Отмена аукциона
  SLOT_SOLD = "slot_sold",                  // Продажа слота
  SHARED = "shared",                        // Поделился ролью
  UNSHARED = "unshared",                    // Убрал расшаривание
  SUSPENDED = "suspended",                  // Приостановка
  REACTIVATED = "reactivated",              // Возобновление
  ROLE_CREATED = "role_created",            // Создание роли
  ROLE_DELETED = "role_deleted"             // Удаление роли
}

@Entity()
export class InventoryHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  inventoryId!: number | null;

  @ManyToOne(() => Inventory, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "inventoryId" })
  inventory!: Relation<Inventory> | null;

  @Column({ 
    type: "enum", 
    enum: InventoryActionType 
  })
  actionType!: InventoryActionType;

  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @Column({ nullable: true })
  targetUserId!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "targetUserId" })
  targetUser!: Relation<User> | null;

  @Column({ type: "bigint", nullable: true })
  amount!: bigint | null; // Сумма операции

  @Column({ type: "json", nullable: true })
  actionData!: {
    // Общие поля
    roleName?: string;
    roleColor?: string;
    discordRoleId?: string;
    
    // Для аукциона
    bidAmount?: number;
    auctionDuration?: number;
    winningBid?: number;
    
    // Для передачи
    transferPrice?: number;
    
    // Для расшаривания
    sharedUsers?: number[];
    
    // Дополнительная информация
    reason?: string;
    notes?: string;
  } | null;

  @CreateDateColumn()
  actionDate!: Date;

  @Column({ type: "text", nullable: true })
  details!: string | null;

  // Индексы для быстрого поиска
  @Index()
  @Column()
  userActionDateIndex!: string; // user_id + action_date для истории пользователя

  @Index()
  @Column()
  inventoryActionIndex!: string; // inventory_id + action_type для истории предмета
}