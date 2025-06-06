import { Discord, Slash, Guard, ModalComponent, ButtonComponent } from "discordx";
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CommandInteraction, ContainerBuilder, MessageFlags, ModalBuilder, ModalSubmitInteraction, SectionBuilder, SeparatorBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";

@Discord()
class TeammateSerch {
    private static async searchFunc(interaction: CommandInteraction | ButtonInteraction) {
        const modal = new ModalBuilder()
            .setTitle("Поиск тиммейта")
            .setCustomId("searchTeammateModal");

        const gameTextInput = new TextInputBuilder()
            .setCustomId("gameTextInput")
            .setLabel("Игра")
            .setPlaceholder("Название игры")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(64)
            .setRequired(true);

        const countMembers = new TextInputBuilder()
            .setCustomId("countMembers")
            .setLabel("Количество игроков")
            .setPlaceholder("1-99")
            .setMaxLength(2)
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        const noteTextInput = new TextInputBuilder()
            .setCustomId("noteTextInput")
            .setLabel("Пожелания")
            .setPlaceholder("Ваши пожелания")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(200)
            .setRequired(false);

        const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(
            gameTextInput,
        );

        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(
            countMembers
        );

        const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(
            noteTextInput
        );

        modal.addComponents(row1, row2, row3);

        interaction.showModal(modal);
    }
    @Slash({
        description: "Отправить сообщение о поиске тиммейтов с кнопкой поиска",
        defaultMemberPermissions: "0",
        dmPermission: false,
    })
    @EnsureUser()
    @Guard(
        EnsureUserGuard(),
        RequireRoles(["high_mod_level", "medium_mod_level"])
    )
    async sendsearchmessage(
        interaction: CommandInteraction
    ) {
        try {
            const contentDispay = new TextDisplayBuilder()
                .setContent("### Поиск тиммейтов\nДля того чтобы найти тиммейта, нажми кнопку ниже")

            const contentContainer = new ContainerBuilder()
                .addTextDisplayComponents(contentDispay)

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Найти")
                    .setCustomId("searchTeammateButton")
                    .setStyle(ButtonStyle.Primary)) as ActionRowBuilder<ButtonBuilder>

            await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [contentContainer, buttons] });

        } catch (error) {
            logger.error("Ошибка в команде teammateSearch:", error);
            const errorEmbed = createErrorEmbed("Произошла ошибка поиске тиммейта", interaction.user);
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
    @ModalComponent()
    async searchTeammateModal(interaction: ModalSubmitInteraction): Promise<void> {
        const [gameName, countMembers, notes] = ["gameTextInput", "countMembers", "noteTextInput"].map((id) =>
            interaction.fields.getTextInputValue(id),
        );

        const headerDisplay = new TextDisplayBuilder()
            .setContent(`### ${interaction.user.displayName} ищет себе тиммейтов`);

        const gameNameDisplay = new TextDisplayBuilder()
            .setContent(`🕹️ **Игра**\n${gameName}`);

        const countMembersDisplay = new TextDisplayBuilder()
            .setContent(`👥 **Количество игроков**\n${countMembers}`);

        const notesDisplay = new TextDisplayBuilder()
            .setContent(`📝 **Пожелания**\n${notes}`);

        const avatarThumbnail = new ThumbnailBuilder({
            description: 'Аватарка пользователя',
            media: {
                url: interaction.user.displayAvatarURL({ extension: 'png', size: 512 }) || interaction.user.defaultAvatarURL,
            },
        });

        const separator = new SeparatorBuilder();
        const footerDisplay = new TextDisplayBuilder()
            .setContent('-# Для того чтобы найти себе тиммейта нажмите кнопку "Найти тиммейта"');

        const searchSections = new SectionBuilder()
            .addTextDisplayComponents(headerDisplay)
            .setThumbnailAccessory(avatarThumbnail)
            .addTextDisplayComponents(gameNameDisplay)
            .addTextDisplayComponents(countMembersDisplay);


        const searchComponent = new ContainerBuilder()
            .addSectionComponents(searchSections)

        if (notes.length > 0) {
            searchComponent.addTextDisplayComponents(notesDisplay);
        };

        searchComponent
            .addSeparatorComponents(separator)
            .addTextDisplayComponents(footerDisplay);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Написать")
                .setURL(`discord:///users/${interaction.user.id}`)
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel("Найти тиммейта")
                .setCustomId("searchTeammateButton")
                .setStyle(ButtonStyle.Success)) as ActionRowBuilder<ButtonBuilder>

        await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [searchComponent, buttons] });

        return;
    }
    @EnsureUser()
    @Guard(
        EnsureUserGuard(),
        Cooldown({ minutes: 30 })
    )
    @ButtonComponent({ id: "searchTeammateButton" })
    async searchTeammateButton(interaction: any) {
        try {
            await TeammateSerch.searchFunc(interaction)
        } catch (error) {
            logger.error("Ошибка в обработке кнопки :", error);
        }
    }
}

export default TeammateSerch;