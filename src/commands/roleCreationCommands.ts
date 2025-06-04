import { Discord, Slash, SlashGroup, Guard, ButtonComponent, ModalComponent } from "discordx";
import { 
  CommandInteraction,
  ModalSubmitInteraction,
  ButtonInteraction,
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
import { RoleApproval } from "../entities/RoleApproval.js";
import { RoleApprovalService } from "../services/roleApprovalService.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import { createErrorEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";

@Discord()
@SlashGroup({
  description: "Создание кастомных ролей",
  name: "rolecreate",
  dmPermission: false,
})
@SlashGroup("rolecreate")
class RoleCreationCommands {
  private approvalService = RoleApprovalService.getInstance();

  @Slash({
    name: "request",
    description: "Запросить создание кастомной роли"
  })
  @Guard(
    ChannelGuard("user_commands_channel"),
    EnsureUserGuard(),
    Cooldown({ minutes: 5 })
  )
  async requestRole(interaction: CommandInteraction) {
    try {
      // Показываем модальное окно для ввода данных роли
      const modal = new ModalBuilder()
        .setCustomId("role_creation_modal")
        .setTitle("🎭 Создание кастомной роли");

      const nameInput = new TextInputBuilder()
        .setCustomId("role_name")
        .setLabel("Название роли")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(50)
        .setPlaceholder("Введите название роли...")
        .setRequired(true);

      const colorInput = new TextInputBuilder()
        .setCustomId("role_color")
        .setLabel("Цвет роли (HEX)")
        .setStyle(TextInputStyle.Short)
        .setMinLength(7)
        .setMaxLength(7)
        .setPlaceholder("#FF0000")
        .setRequired(true);

      const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
      const colorRow = new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput);

      modal.addComponents(nameRow, colorRow);

      await interaction.showModal(modal);

    } catch (error) {
      logger.error("Error in requestRole command:", error);
      
      if (!interaction.replied) {
        const errorEmbed = createErrorEmbed("Ошибка при открытии формы создания роли", interaction.user);
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }

  @ModalComponent({ id: "role_creation_modal" })
  async handleRoleCreationModal(interaction: ModalSubmitInteraction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const roleName = interaction.fields.getTextInputValue("role_name").trim();
      const roleColor = interaction.fields.getTextInputValue("role_color").trim();

      // Валидация названия
      if (roleName.length < 2 || roleName.length > 50) {
        const errorEmbed = createErrorEmbed(
          "Название роли должно быть от 2 до 50 символов",
          interaction.user
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Валидация цвета
      const colorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!colorRegex.test(roleColor)) {
        const errorEmbed = createErrorEmbed(
          "Неверный формат цвета! Используйте HEX формат: #FF0000",
          interaction.user
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Проверяем запрещенные слова (можно вынести в конфиг)
      const bannedWords = ['admin', 'mod', 'owner', 'staff', 'everyone', 'here'];
      const lowerName = roleName.toLowerCase();
      if (bannedWords.some(word => lowerName.includes(word))) {
        const errorEmbed = createErrorEmbed(
          "Название роли содержит запрещенные слова",
          interaction.user
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
        where: { discordId: interaction.user.id }
      });

      // Создаем заявку
      const result = await this.approvalService.createRoleRequest(
        dbUser.id,
        roleName,
        roleColor,
        {
          guildId: interaction.guildId!,
          interactionId: interaction.id
        }
      );

      if (result.success) {
        // Отправляем заявку на модерацию
        await this.sendModerationRequest(result.approvalId!, roleName, roleColor, interaction.user.id);

        const successEmbed = new EmbedBuilder()
          .setTitle("✅ Заявка отправлена")
          .setDescription(result.message)
          .addFields(
            { name: "Название роли", value: roleName, inline: true },
            { name: "Цвет", value: roleColor, inline: true },
            { name: "ID заявки", value: `#${result.approvalId}`, inline: true }
          )
          .setColor(parseInt(roleColor.replace('#', ''), 16))
          .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });
      } else {
        const errorEmbed = createErrorEmbed(result.message, interaction.user);
        await interaction.editReply({ embeds: [errorEmbed] });
      }

    } catch (error) {
      logger.error("Error handling role creation modal:", error);
      const errorEmbed = createErrorEmbed("Ошибка при обработке заявки", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  @Slash({
    name: "mystatus",
    description: "Посмотреть статус своих заявок на роли"
  })
  @Guard(
    ChannelGuard("user_commands_channel"),
    EnsureUserGuard()
  )
  async myStatus(interaction: CommandInteraction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
        where: { discordId: interaction.user.id }
      });

      const pendingApprovals = await this.approvalService.getUserPendingApprovals(dbUser.id);

      const embed = new EmbedBuilder()
        .setTitle("📋 Мои заявки на роли")
        .setColor(Colors.Blue)
        .setTimestamp();

      if (pendingApprovals.length === 0) {
        embed.setDescription("У вас нет активных заявок на создание ролей");
      } else {
        let description = "";
        for (const approval of pendingApprovals) {
          description += `**#${approval.id}** - ${approval.roleName}\n`;
          description += `🎨 Цвет: ${approval.roleColor}\n`;
          description += `📅 Создана: <t:${Math.floor(approval.createdAt.getTime() / 1000)}:R>\n\n`;
        }
        embed.setDescription(description);
      }

      const buttons = new ActionRowBuilder<ButtonBuilder>();
      
      if (pendingApprovals.length > 0) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId("cancel_role_request")
            .setLabel("Отменить заявку")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
        );
      }

      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId("create_new_role")
          .setLabel("Новая заявка")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("➕")
      );

      await interaction.editReply({ 
        embeds: [embed], 
        components: [buttons]
      });

    } catch (error) {
      logger.error("Error in myStatus command:", error);
      const errorEmbed = createErrorEmbed("Ошибка при получении статуса заявок", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  // Обработчики кнопок
  @ButtonComponent({ id: "create_new_role" })
  async handleCreateNewRole(interaction: ButtonInteraction) {
    try {
      // Перенаправляем к команде создания роли
      await this.requestRole(interaction as any);
    } catch (error) {
      logger.error("Error in handleCreateNewRole:", error);
    }
  }

  @ButtonComponent({ id: "cancel_role_request" })
  async handleCancelRequest(interaction: ButtonInteraction) {
    try {
      const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
        where: { discordId: interaction.user.id }
      });

      const pendingApprovals = await this.approvalService.getUserPendingApprovals(dbUser.id);

      if (pendingApprovals.length === 0) {
        await interaction.reply({
          content: "❌ У вас нет активных заявок для отмены",
          ephemeral: true
        });
        return;
      }

      // Если есть только одна заявка, отменяем её сразу
      if (pendingApprovals.length === 1) {
        const result = await this.approvalService.cancelRequest(dbUser.id, pendingApprovals[0].id);
        
        const embed = new EmbedBuilder()
          .setTitle(result.success ? "✅ Заявка отменена" : "❌ Ошибка")
          .setDescription(result.message)
          .setColor(result.success ? Colors.Green : Colors.Red)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Если заявок несколько, показываем выбор
      const buttons = new ActionRowBuilder<ButtonBuilder>();
      
      for (let i = 0; i < Math.min(pendingApprovals.length, 5); i++) {
        const approval = pendingApprovals[i];
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`cancel_approval_${approval.id}`)
            .setLabel(`#${approval.id} - ${approval.roleName}`)
            .setStyle(ButtonStyle.Danger)
        );
      }

      const embed = new EmbedBuilder()
        .setTitle("🗑️ Выберите заявку для отмены")
        .setDescription("Выберите заявку, которую хотите отменить:")
        .setColor(Colors.Orange);

      await interaction.reply({ 
        embeds: [embed], 
        components: [buttons],
        ephemeral: true
      });

    } catch (error) {
      logger.error("Error in handleCancelRequest:", error);
      await interaction.reply({
        content: "❌ Произошла ошибка при отмене заявки",
        ephemeral: true
      });
    }
  }

  @ButtonComponent({ id: /^cancel_approval_\d+$/ })
  async handleCancelSpecificApproval(interaction: ButtonInteraction) {
    try {
      await interaction.deferUpdate();
      
      const approvalId = parseInt(interaction.customId.split('_')[2]);
      
      const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
        where: { discordId: interaction.user.id }
      });

      const result = await this.approvalService.cancelRequest(dbUser.id, approvalId);
      
      const embed = new EmbedBuilder()
        .setTitle(result.success ? "✅ Заявка отменена" : "❌ Ошибка")
        .setDescription(result.message)
        .setColor(result.success ? Colors.Green : Colors.Red)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], components: [] });

    } catch (error) {
      logger.error("Error in handleCancelSpecificApproval:", error);
      const errorEmbed = createErrorEmbed("Произошла ошибка при отмене заявки", interaction.user);
      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
  }

  // Вспомогательный метод для отправки заявки на модерацию
  private async sendModerationRequest(
    approvalId: number, 
    roleName: string, 
    roleColor: string, 
    userId: string
  ): Promise<void> {
    try {
      // Получаем канал модерации из конфига
      const configRepository = AppDataSource.getRepository(Config);
      const moderationChannelConfig = await configRepository.findOne({
        where: { key: "moderation_channel" }
      });

      if (!moderationChannelConfig || !moderationChannelConfig.value) {
        logger.warn("Moderation channel not configured");
        return;
      }

      const moderationChannel = await interaction.client.channels.fetch(moderationChannelConfig.value) as TextChannel;
      
      if (!moderationChannel) {
        logger.error("Moderation channel not found");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🎭 Новая заявка на создание роли")
        .setDescription(`Пользователь <@${userId}> запросил создание кастомной роли`)
        .addFields(
          { name: "ID заявки", value: `#${approvalId}`, inline: true },
          { name: "Название роли", value: roleName, inline: true },
          { name: "Цвет", value: roleColor, inline: true }
        )
        .setColor(parseInt(roleColor.replace('#', ''), 16))
        .setTimestamp();

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_role_${approvalId}`)
          .setLabel("Одобрить")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅"),
        new ButtonBuilder()
          .setCustomId(`reject_role_${approvalId}`)
          .setLabel("Отклонить")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌")
      );

      await moderationChannel.send({ embeds: [embed], components: [buttons] });

    } catch (error) {
      logger.error("Error sending moderation request:", error);
    }
  }
}

export default RoleCreationCommands;