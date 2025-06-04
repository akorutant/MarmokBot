import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

export enum ShopItemType {
  ROLE_SLOT = "role_slot",
  ROLE_MAINTENANCE = "role_maintenance"
}

@Entity()
export class ShopConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ 
    type: "enum", 
    enum: ShopItemType,
    unique: true 
  })
  itemType!: ShopItemType;

  @Column({ type: "bigint" })
  price!: bigint;

  @Column({ type: "int", default: 14 })
  maintenanceDays!: number; // Каждые сколько дней нужно платить поддержку

  @Column({ type: "int", default: 2 })
  maxSharingSlots!: number; // Максимум пользователей для расшаривания

  @Column({ type: "int", default: 7 })
  auctionMaxDays!: number; // Максимальная длительность аукциона

  @Column({ type: "float", default: 0.5 })
  slotRefundRate!: number; // Коэффициент возврата при продаже слота (0.5 = 50%)

  @Column({ type: "boolean", default: true })
  isEnabled!: boolean;

  @Column({ type: "json", nullable: true })
  additionalSettings!: {
    // Настройки для ролей
    maxRoleNameLength?: number;
    allowedRoleColors?: string[];
    bannedRoleNames?: string[];
    
    // Настройки аукциона
    minAuctionPrice?: number;
    maxAuctionPrice?: number;
    bidIncrement?: number;
    
    // Другие настройки
    gracePeriodDays?: number; // Период отсрочки перед снятием роли
    notificationDays?: number; // За сколько дней уведомлять о необходимости оплаты
  } | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}