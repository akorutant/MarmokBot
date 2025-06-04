import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";

export enum InventoryItemType {
  ROLE_SLOT = "role_slot",
  CUSTOM_ROLE = "custom_role",
  // Можно добавить другие типы предметов
  BACKGROUND = "background",
  BADGE = "badge"
}

export enum InventoryItemStatus {
  ACTIVE = "active",
  EXPIRED = "expired", 
  SUSPENDED = "suspended", // Не оплачена поддержка
  TRANSFERRING = "transferring", // В процессе передачи
  SOLD = "sold" // Слот продан, но роль еще есть
}

@Entity()
export class Inventory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @Column({ 
    type: "enum", 
    enum: InventoryItemType 
  })
  itemType!: InventoryItemType;

  @Column({ 
    type: "enum", 
    enum: InventoryItemStatus,
    default: InventoryItemStatus.ACTIVE 
  })
  status!: InventoryItemStatus;

  // Для ролей - это roleId из Discord, для других предметов - уникальный идентификатор
  @Column({ length: 100, nullable: true })
  itemIdentifier!: string | null;

  // JSON данные для хранения специфичной информации предмета
  @Column({ type: "json", nullable: true })
  itemData!: {
    // Для ролей
    roleName?: string;
    roleColor?: string;
    discordRoleId?: string;
    originalCreator?: number; // ID создателя роли
    
    // Общие поля
    purchasePrice?: number;
    maintenanceCost?: number;
    description?: string;
    
    // Для аукциона
    auctionData?: {
      startTime: Date;
      endTime: Date;
      startingBid: number;
      currentBid: number;
      currentBidder: number | null;
      isActive: boolean;
    };
  } | null;

  @CreateDateColumn()
  purchaseDate!: Date;

  @Column({ type: "timestamp", nullable: true })
  expirationDate!: Date | null;

  @Column({ type: "timestamp", nullable: true })
  lastMaintenanceDate!: Date | null;

  @Column({ type: "timestamp", nullable: true })
  nextMaintenanceDate!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Index()
  @Column({ name: "user_id_type_status" })
  userTypeStatusIndex!: string;
}
