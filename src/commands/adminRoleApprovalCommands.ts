import { Discord, Slash, SlashOption, SlashGroup, Guard } from "discordx";
import { 
  CommandInteraction, 
  ApplicationCommandOptionType, 
  EmbedBuilder, 
  Colors,
  User as DiscordUser
} from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { RoleApproval, ApprovalStatus } from "../entities/RoleApproval.js";
import { RoleApprovalService } from "../services/roleApprovalService.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { createErrorEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";

@Discord()
@SlashGroup({
  description: "Административные команды для управления заявками на роли",
  name: "roleapproval",
  dmPermission: false,
  defaultMemberPermissions: "0"
})
@SlashGroup("roleapproval")
class AdminRoleApprovalCommands {
  private approvalService = RoleApprovalService.getInstance();

  @Slash({
    name: "list",
    description: "Посмотреть все заявки на роли"
  })
  @Guard(
    RequireRoles(["low_mod_level", "medium_mod_level", "high_mod_level"]),
    EnsureUserGuard()
  )
  async listApprovals(
    @SlashOption({
      name: "status",
      description: "Фильтр по статусу",
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: "Pending", value: "pending" },
        { name: "Approved", value: "approved" },
        { name: "Rejected", value: "rejected" },
        { name: "Cancelled", value: "cancelled" }
      ]
    })
    status?: string,
    @SlashOption({
      name: "user",
      description: "Фильтр по пользователю",
      type: ApplicationCommandOptionType.User,
      required: false
    })
    user?: DiscordUser,
    interaction: CommandInteraction
  ) {
    try {
      await interaction.deferReply({ ephemeral: true });

      let approvals: RoleApproval[];

      if (status === "pending" || !status) {
        approvals = await this.approvalService.getPendingApprovals();
      } else {
        // Получаем все заявки с фильтрацией
        const repo = AppDataSource.getRepository(RoleApproval);
        const query = repo.createQueryBuilder("approval")
          .leftJoinAndSelect("approval.user", "user")
          .leftJoinAndSelect("approval.moderator", "moderator");

        if (status) {
          query.where("approval.status = :status", { status });
        }

        if (user) {
          const dbUser = await AppDataSource.getRepository(DBUser).findOne({
            where: { discordId: user.id }
          });
          if (dbUser) {
            query.andWhere("approval.userId = :userId", { userId: dbUser.id });
          }
        }

        approvals = await query
          .orderBy("approval.createdAt", "DESC")
          .limit(20)
          .getMany();
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Заявки на роли")
        .setColor(Colors.Blue)
        .setTimestamp();

      if (approvals.length === 0) {
        embed.setDescription("Заявки не найдены");
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let description = "";
      for (const approval of approvals.slice(0, 10)) {
        const statusEmoji = this.getStatusEmoji(approval.status);
        const userMention = `<@${approval.user.discordId}>`;
        
        description += `${statusEmoji} **#${approval.id}** - ${approval.roleName}\n`;
        description += `👤 ${userMention} | 🎨 ${approval.roleColor}\n`;
        description += `📅 <t:${Math.floor(approval.createdAt.getTime() / 1000)}:R>\n`;
        
        if (approval.moderator) {
          description += `🛡️ Модератор: <@${approval.moderator.discordId}>\n`;
        }
        description += "\n";
      }

      embed.setDescription(description);

      if (approvals.length > 10) {
        embed.setFooter({ text: `Показано 10 из ${approvals.length} заявок` });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error("Error in listApprovals command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при получении списка заявок", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "approve",
    description: "Одобрить заявку на роль"
  })
  @Guard(
    RequireRoles(["low_mod_level", "medium_mod_level", "high_mod_level"]),
    EnsureUserGuard()
  )
  async approveRequest(
    @SlashOption({
      name: "id",
      description: "ID заявки",
      type: ApplicationCommandOptionType.Integer,
      required: true
    })
    approvalId: number,
    interaction: CommandInteraction
  ) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const dbModerator = await AppDataSource.getRepository(DBUser).findOneOrFail({
        where: { discordId: interaction.user.id }
      });

      const result = await this.approvalService.approveRole(approvalId, dbModerator.id);

      const embed = new EmbedBuilder()
        .setTitle(result.success ? "✅ Заявка одобрена" : "❌ Ошибка")
        .setDescription(result.message)
        .setColor(result.success ? Colors.Green : Colors.Red)
        .setTimestamp();

      if (result.success) {
        embed.addFields(
          { name: "ID заявки", value: `#${approvalId}`, inline: true },
          { name: "Модератор", value: `<@${interaction.user.id}>`, inline: true }
        );
      }

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Role approval ${approvalId} ${result.success ? 'approved' : 'failed'} by ${interaction.user.id}`);

    } catch (error) {
      logger.error("Error in approveRequest command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при одобрении заявки", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "reject",
    description: "Отклонить заявку на роль"
  })
  @Guard(
    RequireRoles(["low_mod_level", "medium_mod_level", "high_mod_level"]),
    EnsureUserGuard()
  )
  async rejectRequest(
    @SlashOption({
      name: "id",
      description: "ID заявки",
      type: ApplicationCommandOptionType.Integer,
      required: true
    })
    approvalId: number,
    @SlashOption({
      name: "reason",
      description: "Причина отклонения",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 500
    })
    reason: string,
    interaction: CommandInteraction
  ) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const dbModerator = await AppDataSource.getRepository(DBUser).findOneOrFail({
        where: { discordId: interaction.user.id }
      });

      const result = await this.approvalService.rejectRole(approvalId, dbModerator.id, reason);

      const embed = new EmbedBuilder()
        .setTitle(result.success ? "❌ Заявка отклонена" : "❌ Ошибка")
        .setDescription(result.message)
        .setColor(Colors.Red)
        .setTimestamp();

      if (result.success) {
        embed.addFields(
          { name: "ID заявки", value: `#${approvalId}`, inline: true },
          { name: "Модератор", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Причина", value: reason, inline: false }
        );
      }

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Role approval ${approvalId} ${result.success ? 'rejected' : 'failed'} by ${interaction.user.id}: ${reason}`);

    } catch (error) {
      logger.error("Error in rejectRequest command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при отклонении заявки", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "details",
    description: "Посмотреть детали заявки"
  })
  @Guard(
    RequireRoles(["low_mod_level", "medium_mod_level", "high_mod_level"]),
    EnsureUserGuard()
  )
  async viewDetails(
    @SlashOption({
      name: "id",
      description: "ID заявки",
      type: ApplicationCommandOptionType.Integer,
      required: true
    })
    approvalId: number,
    interaction: CommandInteraction
  ) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const approval = await this.approvalService.getApproval(approvalId);

      if (!approval) {
        const errorEmbed = createErrorEmbed("Заявка не найдена", interaction.user);
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Детали заявки #${approval.id}`)
        .addFields(
          { name: "Название роли", value: approval.roleName, inline: true },
          { name: "Цвет", value: approval.roleColor, inline: true },
          { name: "Статус", value: this.getStatusText(approval.status), inline: true },
          { name: "Пользователь", value: `<@${approval.user.discordId}>`, inline: true },
          { name: "Создана", value: `<t:${Math.floor(approval.createdAt.getTime() / 1000)}:F>`, inline: true }
        )
        .setColor(parseInt(approval.roleColor.replace('#', ''), 16))
        .setTimestamp();

      if (approval.moderator) {
        embed.addFields(
          { name: "Модератор", value: `<@${approval.moderator.discordId}>`, inline: true },
          { name: "Обработана", value: approval.processedAt ? `<t:${Math.floor(approval.processedAt.getTime() / 1000)}:F>` : "Не обработана", inline: true }
        );
      }

      if (approval.rejectionReason) {
        embed.addFields(
          { name: "Причина отклонения", value: approval.rejectionReason, inline: false }
        );
      }

      if (approval.metadata) {
        const metadata = approval.metadata;
        let metadataText = "";
        if (metadata.originalPrice) metadataText += `💰 Стоимость: ${metadata.originalPrice}$\n`;
        if (metadata.userBalance) metadataText += `💳 Баланс пользователя: ${metadata.userBalance}$\n`;
        if (metadata.guildId) metadataText += `🏠 Сервер: ${metadata.guildId}\n`;
        
        if (metadataText) {
          embed.addFields({ name: "Дополнительная информация", value: metadataText, inline: false });
        }
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error("Error in viewDetails command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при получении деталей заявки", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "stats",
    description: "Статистика заявок на роли"
  })
  @Guard(
    RequireRoles(["medium_mod_level", "high_mod_level"]),
    EnsureUserGuard()
  )
  async approvalStats(interaction: CommandInteraction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const stats = await this.approvalService.getApprovalStats();

      const embed = new EmbedBuilder()
        .setTitle("📊 Статистика заявок на роли")
        .addFields(
          { name: "⏳ На рассмотрении", value: stats.pending.toString(), inline: true },
          { name: "✅ Одобрено", value: stats.approved.toString(), inline: true },
          { name: "❌ Отклонено", value: stats.rejected.toString(), inline: true },
          { name: "🚫 Отменено", value: stats.cancelled.toString(), inline: true },
          { name: "📈 Всего заявок", value: (stats.pending + stats.approved + stats.rejected + stats.cancelled).toString(), inline: true },
          { name: "✅ Процент одобрения", value: `${Math.round((stats.approved / Math.max(stats.approved + stats.rejected, 1)) * 100)}%`, inline: true }
        )
        .setColor(Colors.Blue)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error("Error in approvalStats command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при получении статистики", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "cleanup",
    description: "Очистить старые заявки (старше 30 дней)"
  })
  @Guard(
    RequireRoles(["high_mod_level"]),
    EnsureUserGuard()
  )
  async cleanupOldApprovals(interaction: CommandInteraction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await AppDataSource
        .createQueryBuilder()
        .delete()
        .from(RoleApproval)
        .where("createdAt < :date", { date: thirtyDaysAgo })
        .andWhere("status IN (:...statuses)", { 
          statuses: [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.CANCELLED] 
        })
        .execute();

      const deletedCount = result.affected || 0;

      const embed = new EmbedBuilder()
        .setTitle("🧹 Очистка завершена")
        .setDescription(`Удалено **${deletedCount}** старых заявок (старше 30 дней)`)
        .setColor(Colors.Green)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Cleaned up ${deletedCount} old role approvals by ${interaction.user.id}`);

    } catch (error) {
      logger.error("Error in cleanupOldApprovals command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при очистке старых заявок", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  // Вспомогательные методы
  private getStatusEmoji(status: ApprovalStatus): string {
    switch (status) {
      case ApprovalStatus.PENDING: return "⏳";
      case ApprovalStatus.APPROVED: return "✅";
      case ApprovalStatus.REJECTED: return "❌";
      case ApprovalStatus.CANCELLED: return "🚫";
      default: return "❓";
    }
  }

  private getStatusText(status: ApprovalStatus): string {
    switch (status) {
      case ApprovalStatus.PENDING: return "⏳ На рассмотрении";
      case ApprovalStatus.APPROVED: return "✅ Одобрено";
      case ApprovalStatus.REJECTED: return "❌ Отклонено";
      case ApprovalStatus.CANCELLED: return "🚫 Отменено";
      default: return "❓ Неизвестно";
    }
  }
}

export default AdminRoleApprovalCommands;