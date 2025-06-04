import { Discord, Slash, SlashOption, SlashGroup, Guard } from "discordx";
import { 
  CommandInteraction, 
  ApplicationCommandOptionType, 
  EmbedBuilder, 
  Colors,
  User as DiscordUser,
  PermissionFlagsBits
} from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ShopConfig, ShopItemType } from "../entities/ShopConfig.js";
import { Inventory } from "../entities/Inventory.js";
import { RoleMaintenanceScheduler } from "../events/RoleMaintenanceSheduler.js";
import { RoleShopService } from "../services/RoleShopService.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { createErrorEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";

@Discord()
@SlashGroup({
  description: "Административные команды для магазина ролей",
  name: "roleadmin",
  dmPermission: false,
  defaultMemberPermissions: [PermissionFlagsBits.Administrator]
})
@SlashGroup("roleadmin")
class AdminRoleCommands {
  private roleShopService = RoleShopService.getInstance();

  @Slash({
    name: "config",
    description: "Настроить конфигурацию магазина ролей"
  })
  @Guard(
    RequireRoles(["admin", "moderator"]),
    EnsureUserGuard()
  )
  async configureShop(
    @SlashOption({
      name: "item",
      description: "Тип предмета для настройки",
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: "Слот роли", value: "role_slot" },
        { name: "Поддержка роли", value: "role_maintenance" }
      ]
    })
    itemType: string,
    @SlashOption({
      name: "price",
      description: "Цена предмета",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 1
    })
    price?: number,
    @SlashOption({
      name: "maintenance_days",
      description: "Период оплаты поддержки в днях",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 1,
      maxValue: 30
    })
    maintenanceDays?: number,
    @SlashOption({
      name: "max_sharing",
      description: "Максимальное количество расшариваний",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 1,
      maxValue: 10
    })
    maxSharing?: number,
    @SlashOption({
      name: "refund_rate",
      description: "Коэффициент возврата при продаже слота (0.1-1.0)",
      type: ApplicationCommandOptionType.Number,
      required: false,
      minValue: 0.1,
      maxValue: 1.0
    })
    refundRate?: number,
    @SlashOption({
      name: "enabled",
      description: "Включить/выключить магазин",
      type: ApplicationCommandOptionType.Boolean,
      required: false
    })
    enabled?: boolean,
    interaction: CommandInteraction
  ) {
    try {
      await interaction.deferReply();

      const shopItemType = itemType as ShopItemType;
      
      // Ищем существующую конфигурацию
      let config = await AppDataSource.getRepository(ShopConfig).findOne({
        where: { itemType: shopItemType }
      });

      if (!config) {
        // Создаем новую конфигурацию
        config = AppDataSource.getRepository(ShopConfig).create({
          itemType: shopItemType,
          price: BigInt(price || 1000),
          maintenanceDays: maintenanceDays || 14,
          maxSharingSlots: maxSharing || 2,
          slotRefundRate: refundRate || 0.5,
          isEnabled: enabled !== undefined ? enabled : true
        });
      } else {
        // Обновляем существующую конфигурацию
        if (price !== undefined) config.price = BigInt(price);
        if (maintenanceDays !== undefined) config.maintenanceDays = maintenanceDays;
        if (maxSharing !== undefined) config.maxSharingSlots = maxSharing;
        if (refundRate !== undefined) config.slotRefundRate = refundRate;
        if (enabled !== undefined) config.isEnabled = enabled;
      }

      await AppDataSource.getRepository(ShopConfig).save(config);

      const embed = new EmbedBuilder()
        .setTitle("✅ Конфигурация обновлена")
        .setDescription(`Настройки для **${itemType}** успешно сохранены`)
        .addFields(
          { name: "Цена", value: `${config.price}$`, inline: true },
          { name: "Период поддержки", value: `${config.maintenanceDays} дней`, inline: true },
          { name: "Макс. расшариваний", value: `${config.maxSharingSlots}`, inline: true },
          { name: "Возврат при продаже", value: `${Math.floor(config.slotRefundRate * 100)}%`, inline: true },
          { name: "Статус", value: config.isEnabled ? "✅ Включено" : "❌ Выключено", inline: true }
        )
        .setColor(Colors.Green)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Shop config updated by ${interaction.user.id}: ${itemType}`);

    } catch (error) {
      logger.error("Error in configureShop command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при обновлении конфигурации", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "stats",
    description: "Статистика магазина ролей"
  })
  @Guard(
    RequireRoles(["admin", "moderator"]),
    EnsureUserGuard()
  )
  async shopStats(interaction: CommandInteraction) {
    try {
      await interaction.deferReply();

      const scheduler = RoleMaintenanceScheduler.getInstance(interaction.client);
      const stats = await scheduler.getRoleStats();
      const config = await this.roleShopService.getShopConfig();

      const embed = new EmbedBuilder()
        .setTitle("📊 Статистика магазина ролей")
        .addFields(
          { name: "🟢 Активные роли", value: stats.activeRoles.toString(), inline: true },
          { name: "⏸️ Приостановленные", value: stats.suspendedRoles.toString(), inline: true },
          { name: "🔄 На аукционе", value: stats.auctionRoles.toString(), inline: true },
          { name: "💸 Проданные слоты", value: stats.soldSlots.toString(), inline: true },
          { name: "🤝 Активные расшаривания", value: stats.totalShares.toString(), inline: true },
          { name: "⏰ Предстоящие платежи", value: stats.upcomingPayments.toString(), inline: true }
        )
        .addFields(
          { name: "💰 Цена слота", value: `${config.roleSlotPrice || 'Не настроено'}$`, inline: true },
          { name: "🔄 Цена поддержки", value: `${config.maintenancePrice || 'Не настроено'}$`, inline: true },
          { name: "📅 Период поддержки", value: `${config.maintenanceDays || 14} дней`, inline: true }
        )
        .setColor(Colors.Blue)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error("Error in shopStats command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при получении статистики", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "force-sync",
    description: "Принудительная синхронизация всех ролей с Discord"
  })
  @Guard(
    RequireRoles(["admin"]),
    EnsureUserGuard()
  )
  async forceSync(interaction: CommandInteraction) {
    try {
      await interaction.deferReply();

      const embed = new EmbedBuilder()
        .setTitle("🔄 Синхронизация запущена")
        .setDescription("Выполняется принудительная синхронизация ролей...")
        .setColor(Colors.Yellow)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      const scheduler = RoleMaintenanceScheduler.getInstance(interaction.client);
      const result = await scheduler.forceSyncAllRoles();

      const resultEmbed = new EmbedBuilder()
        .setTitle("✅ Синхронизация завершена")
        .addFields(
          { name: "Обработано ролей", value: result.rolesProcessed.toString(), inline: true },
          { name: "Создано ролей", value: result.rolesCreated.toString(), inline: true },
          { name: "Синхронизировано серверов", value: result.rolesSynced.toString(), inline: true },
          { name: "Ошибок", value: result.errors.toString(), inline: true }
        )
        .setColor(result.errors > 0 ? Colors.Orange : Colors.Green)
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });

      logger.info(`Force sync completed by ${interaction.user.id}:`, result);

    } catch (error) {
      logger.error("Error in forceSync command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при синхронизации ролей", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "user-roles",
    description: "Посмотреть роли конкретного пользователя"
  })
  @Guard(
    RequireRoles(["admin", "moderator"]),
    EnsureUserGuard()
  )
  async userRoles(
    @SlashOption({
      name: "user",
      description: "Пользователь для проверки",
      type: ApplicationCommandOptionType.User,
      required: true
    })
    targetUser: DiscordUser,
    interaction: CommandInteraction
  ) {
    try {
      await interaction.deferReply();

      const dbUser = await AppDataSource.getRepository(DBUser).findOne({
        where: { discordId: targetUser.id }
      });

      if (!dbUser) {
        const errorEmbed = createErrorEmbed("Пользователь не найден в базе данных", interaction.user);
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const { ownedRoles, sharedRoles } = await this.roleShopService.getUserRoles(dbUser.id);

      const embed = new EmbedBuilder()
        .setTitle(`🎭 Роли пользователя ${targetUser.displayName}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor(Colors.Blue)
        .setTimestamp();

      let description = "";

      if (ownedRoles.length > 0) {
        description += "**👑 Владеет ролями:**\n";
        for (const role of ownedRoles) {
          const roleName = role.itemData?.roleName || "Неизвестная роль";
          const status = this.getStatusText(role.status);
          const nextPayment = role.nextMaintenanceDate ? 
            `<t:${Math.floor(role.nextMaintenanceDate.getTime() / 1000)}:R>` : 
            "Не требуется";
          
          description += `• **${roleName}** - ${status}\n  💰 Следующая оплата: ${nextPayment}\n`;
        }
        description += "\n";
      }

      if (sharedRoles.length > 0) {
        description += "**🤝 Расшаренные роли:**\n";
        for (const share of sharedRoles) {
          const roleName = share.inventory.itemData?.roleName || "Неизвестная роль";
          description += `• **${roleName}** (от <@${share.ownerId}>)\n`;
        }
      }

      if (description === "") {
        description = "У пользователя нет ролей";
      }

      embed.setDescription(description);
      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error("Error in userRoles command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при получении ролей пользователя", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "force-payment",
    description: "Принудительно продлить роль пользователя"
  })
  @Guard(
    RequireRoles(["admin"]),
    EnsureUserGuard()
  )
  async forcePayment(
    @SlashOption({
      name: "user",
      description: "Пользователь",
      type: ApplicationCommandOptionType.User,
      required: true
    })
    targetUser: DiscordUser,
    @SlashOption({
      name: "role",
      description: "Название роли",
      type: ApplicationCommandOptionType.String,
      required: true
    })
    roleName: string,
    @SlashOption({
      name: "days",
      description: "На сколько дней продлить",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 1,
      maxValue: 365
    })
    days: number = 14,
    interaction: CommandInteraction
  ) {
    try {
      await interaction.deferReply();

      const dbUser = await AppDataSource.getRepository(DBUser).findOne({
        where: { discordId: targetUser.id }
      });

      if (!dbUser) {
        const errorEmbed = createErrorEmbed("Пользователь не найден в базе данных", interaction.user);
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const { ownedRoles } = await this.roleShopService.getUserRoles(dbUser.id);
      const role = ownedRoles.find(r => 
        r.itemData?.roleName?.toLowerCase() === roleName.toLowerCase()
      );

      if (!role) {
        const errorEmbed = createErrorEmbed(`Роль "${roleName}" не найдена у пользователя`, interaction.user);
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Принудительно продлеваем роль
      const newPaymentDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      
      await AppDataSource.getRepository(Inventory).update(
        { id: role.id },
        { 
          nextMaintenanceDate: newPaymentDate,
          status: role.status === "suspended" ? "active" : role.status
        }
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ Роль принудительно продлена")
        .addFields(
          { name: "Пользователь", value: `<@${targetUser.id}>`, inline: true },
          { name: "Роль", value: roleName, inline: true },
          { name: "Продлена на", value: `${days} дней`, inline: true },
          { name: "Следующая оплата", value: `<t:${Math.floor(newPaymentDate.getTime() / 1000)}:R>`, inline: false }
        )
        .setColor(Colors.Green)
        .setTimestamp()
        .setFooter({ text: `Выполнено администратором ${interaction.user.displayName}` });

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Role ${role.id} force extended by admin ${interaction.user.id} for user ${targetUser.id}`);

    } catch (error) {
      logger.error("Error in forcePayment command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при продлении роли", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "cleanup-history",
    description: "Очистить старую историю операций"
  })
  @Guard(
    RequireRoles(["admin"]),
    EnsureUserGuard()
  )
  async cleanupHistory(interaction: CommandInteraction) {
    try {
      await interaction.deferReply();

      const scheduler = RoleMaintenanceScheduler.getInstance(interaction.client);
      const deletedRows = await scheduler.cleanupOldHistory();

      const embed = new EmbedBuilder()
        .setTitle("🧹 Очистка истории завершена")
        .setDescription(`Удалено **${deletedRows}** старых записей (старше 3 месяцев)`)
        .setColor(Colors.Green)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info(`History cleanup completed by ${interaction.user.id}: ${deletedRows} rows deleted`);

    } catch (error) {
      logger.error("Error in cleanupHistory command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при очистке истории", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "health",
    description: "Проверить состояние системы ролей"
  })
  @Guard(
    RequireRoles(["admin"]),
    EnsureUserGuard()
  )
  async healthCheck(interaction: CommandInteraction) {
    try {
      await interaction.deferReply();

      const scheduler = RoleMaintenanceScheduler.getInstance(interaction.client);
      const health = await scheduler.healthCheck();

      const embed = new EmbedBuilder()
        .setTitle(`${health.isHealthy ? "✅" : "❌"} Состояние системы ролей`)
        .setColor(health.isHealthy ? Colors.Green : Colors.Red)
        .setTimestamp();

      let description = "**Проверки системы:**\n";
      for (const [check, status] of Object.entries(health.checks)) {
        description += `${status ? "✅" : "❌"} ${this.getCheckName(check)}\n`;
      }

      if (health.lastRun) {
        description += `\n**Последняя проверка:** <t:${Math.floor(health.lastRun.getTime() / 1000)}:R>`;
      }

      embed.setDescription(description);
      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error("Error in healthCheck command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при проверке состояния системы", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  // Вспомогательные методы
  private getStatusText(status: string): string {
    switch (status) {
      case "active": return "✅ Активна";
      case "suspended": return "⏸️ Приостановлена";
      case "expired": return "❌ Истекла";
      case "transferring": return "🔄 На аукционе";
      case "sold": return "💸 Слот продан";
      default: return "❓ Неизвестно";
    }
  }

  private getCheckName(check: string): string {
    switch (check) {
      case "database": return "База данных";
      case "discord": return "Discord подключение";
      case "inventoryTable": return "Таблица инвентаря";
      case "scheduler": return "Планировщик";
      default: return check;
    }
  }
}

export default AdminRoleCommands;