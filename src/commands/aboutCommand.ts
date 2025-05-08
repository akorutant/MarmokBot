import { Discord, Slash, Guard } from "discordx";
import { CommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, TextDisplayBuilder } from "discord.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import logger from "../services/logger.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { readFileSync } from "fs";
import { join } from "path";

@Discord()
class AboutCommand {
    @Slash({ description: "Информация о боте" })
    @EnsureUser()
    @Guard(
        Cooldown({ minutes: 1 }),
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard()
    )
    async about(
        interaction: CommandInteraction
    ) {
        try {
            const changeLogFromMd = readFileSync(join(process.cwd(), "change_log.md"), 'utf-8') || "Изменений нет";
            const content = new TextDisplayBuilder().setContent(
                '### 🤖 Информация о боте\nРазработчики бота: <@805350459337998346>, <@329535901938089995>'
            );
            const changeLog = new TextDisplayBuilder().setContent(
                `### 📝 Недавние изменения\n-# [Репозиторий бота на Github](https://github.com/akorutant/MarmokBot)\n${changeLogFromMd}`
            );
            const footer = new TextDisplayBuilder().setContent('В случае ошибок бота обращайтесь в [телеграм](https://t.me/sufferedkid)')
            const separator = new SeparatorBuilder()
            const component = new ContainerBuilder().setAccentColor(0x903FFF)
                .addTextDisplayComponents(content)
                .addSeparatorComponents(separator)
                .addTextDisplayComponents(changeLog)
                .addSeparatorComponents(separator)
                .addTextDisplayComponents(footer)
            await interaction.reply({
                flags: MessageFlags.IsComponentsV2,
                components: [component]
            })
        }
        catch (error) {
            logger.error("Ошибка в команде about", error)
        }
    }
}

export default AboutCommand;