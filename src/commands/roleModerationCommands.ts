import { Discord, ButtonComponent, ModalComponent } from "discordx";
import { 
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Colors,
  TextChannel
} from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { Config } from "../entities/Config.js";
import { RoleApproval, ApprovalStatus } from "../entities/RoleApproval.js";
import { RoleApprovalService } from "../services/roleApprovalService.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { createErrorEmbed } from "../utils/embedBuilder.js";
import { userHasAnyRoleFromConfig } from "../utils/userHasAnyRoleFromConfig.js";
import logger from "../services/logger.js";
import { bot } from "../main.js";

@Discord()
class RoleModerationCommands {
  private approvalService = RoleApprovalService.getInstance();

  @ButtonComponent({ id: /^approve_role_\d+$/ })
  async handleApproveRole(interaction: ButtonInteraction) {
    try {
      // Проверяем права доступа
      const hasPermission = await userHasAnyRoleFromConfig(
        interaction, 
        ["low_mod_level", "medium_mod_level", "high_mod_level"]
      );

      if (!hasPermission) {
        await interaction.reply({
          content: "❌ У вас нет прав для модерации ролей",
          ephemeral: true
        });
        return;
      }

      const approvalId = parseInt(interaction.customId.split('_')[2]);
      
      const dbModerator = await AppDataSource.getRepository(DBUser).findOneOrFail({
        where: { discordId: interaction.user.id }
      });

      const result = await this.approvalService.approveRole(approvalId, dbModerator.id);

      if (result.success) {
        // Обновляем сообщение
        const approvedEmbed = new EmbedBuilder()
          .setTitle("✅ Роль одобрена")
          .setDescription("Заявка была одобрена и роль создана")
          .addFields(
            { name: "Модератор", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Время одобрения", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          )
          .setColor(Colors.Green)
          .setTimestamp();

        await interaction.update({ 
          embeds: [approvedEmbed], 
          components: [] 
        });

        // Уведомляем пользователя
        await this.notifyUser(approvalId, true);

        logger.info(`Role approval ${approvalId} approved by ${interaction.user.id}`);
      } else {
        const errorEmbed = createErrorEmbed(result.message, interaction.user);
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

    } catch (error) {
      logger.error("Error in handleApproveRole:", error);
      const errorEmbed = createErrorEmbed("Ошибка при одобрении роли", interaction.user);
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }

  @ButtonComponent({ id: /^reject_role_\d+$/ })
  async handleRejectRole(interaction: ButtonInteraction) {
    try {
      // Проверяем права доступа
      const hasPermission = await userHasAnyRoleFromConfig(
        interaction,
        ["low_mod_level", "medium_mod_level", "high_mod_level"]
      );

      if (!hasPermission) {
        await interaction.reply({
          content: "❌ У вас нет прав для модерации ролей",
          ephemeral: true
        });
        return;
      }

      const approvalId = parseInt(interaction.customId.split('_')[2]);

      // Показываем модальное окно для ввода причины отклонения
      const modal = new ModalBuilder()
        .setCustomId(`rejection_modal_${approvalId}`)
        .setTitle("❌ Отклонение заявки на роль");

      const reasonInput = new TextInputBuilder()
        .setCustomId("rejection_reason")
        .setLabel("Причина отклонения")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(10)
        .setMaxLength(500)
        .setPlaceholder("Укажите причину отклонения заявки...")
        .setRequired(true);

      const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
      modal.addComponents(reasonRow);

      await interaction.showModal(modal);

    } catch (error) {
      logger.error("Error in handleRejectRole:", error);
      const errorEmbed = createErrorEmbed("Ошибка при отклонении роли", interaction.user);
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }

  @ModalComponent({ id: /^rejection_modal_\d+$/ })
  async handleRejectionModal(interaction: ModalSubmitInteraction) {
    try {
      await interaction.deferUpdate();

      const approvalId = parseInt(interaction.customId.split('_')[2]);
      const rejectionReason = interaction.fields.getTextInputValue("rejection_reason").trim();

      const dbModerator = await AppDataSource.getRepository(DBUser).findOneOrFail({
        where: { discordId: interaction.user.id }
      });

      const result = await this.approvalService.rejectRole(
        approvalId, 
        dbModerator.id, 
        rejectionReason
      );

      if (result.success) {
        // Обновляем сообщение
        const rejectedEmbed = new EmbedBuilder()
          .setTitle("❌ Роль отклонена")
          .setDescription("Заявка была отклонена")
          .addFields(
            { name: "Модератор", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Время отклонения", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: "Причина", value: rejectionReason, inline: false }
          )
          .setColor(Colors.Red)
          .setTimestamp();

        await interaction.editReply({ 
          embeds: [rejectedEmbed], 
          components: [] 
        });

        // Уведомляем пользователя
        await this.notifyUser(approvalId, false, rejectionReason);

        logger.info(`Role approval ${approvalId} rejected by ${interaction.user.id}: ${rejectionReason}`);
      } else {
        const errorEmbed = createErrorEmbed(result.message, interaction.user);
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      }

    } catch (error) {
      logger.error("Error in handleRejectionModal:", error);
      const errorEmbed = createErrorEmbed("Ошибка при обработке отклонения", interaction.user);
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
  }

  // Уведомление пользователя о результате модерации
  private async notifyUser(
    approvalId: number, 
    approved: boolean, 
    rejectionReason?: string
  ): Promise<void> {
    try {
      const approval = await this.approvalService.getApproval(approvalId);
      if (!approval) {
        logger.error(`Approval ${approvalId} not found for notification`);
        return;
      }

      const user = await bot.users.fetch(approval.user.discordId);
      if (!user) {
        logger.warn(`User ${approval.user.discordId} not found for notification`);
        return;
      }

      let embed: EmbedBuilder;
      
      if (approved) {
        embed = new EmbedBuilder()
          .setTitle("🎉 Ваша роль одобрена!")
          .setDescription(`Поздравляем! Ваша заявка на роль **${approval.roleName}** была одобрена.`)
          .addFields(
            { name: "Название роли", value: approval.roleName, inline: true },
            { name: "Цвет", value: approval.roleColor, inline: true },
            { name: "ID заявки", value: `#${approval.id}`, inline: true }
          )
          .setColor(parseInt(approval.roleColor.replace('#', ''), 16))
          .setTimestamp()
          .setFooter({ text: "Роль активна и готова к использованию!" });
      } else {
        embed = new EmbedBuilder()
          .setTitle("❌ Ваша заявка отклонена")
          .setDescription(`К сожалению, ваша заявка на роль **${approval.roleName}** была отклонена.`)
          .addFields(
            { name: "Название роли", value: approval.roleName, inline: true },
            { name: "ID заявки", value: `#${approval.id}`, inline: true },
            { name: "Причина отклонения", value: rejectionReason || "Не указана", inline: false }
          )
          .setColor(Colors.Red)
          .setTimestamp()
          .setFooter({ text: "Вы можете подать новую заявку с учетом замечаний" });
      }

      try {
        await user.send({ embeds: [embed] });
        logger.info(`Notification sent to user ${approval.user.discordId} for approval ${approvalId}`);
      } catch (dmError) {
        logger.warn(`Failed to send DM to user ${approval.user.discordId}, trying fallback channel`);
        
        // Отправляем в канал пользовательских команд как fallback
        const fallbackChannelConfig = await AppDataSource.getRepository(Config).findOne({
          where: { key: "user_commands_channel" }
        });

        if (fallbackChannelConfig) {
          const channel = await bot.channels.fetch(fallbackChannelConfig.value) as TextChannel;
          if (channel) {
            const publicEmbed = embed.setDescription(
              `<@${approval.user.discordId}>, ${embed.data.description}`
            );
            await channel.send({ embeds: [publicEmbed] });
            logger.info(`Fallback notification sent for approval ${approvalId}`);
          }
        }
      }

    } catch (error) {
      logger.error(`Error sending notification for approval ${approvalId}:`, error);
    }
  }
}

export default RoleModerationCommands;