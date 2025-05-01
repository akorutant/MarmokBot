import { Discord, On } from "discordx";
import { Interaction, Events } from "discord.js";
import { RoleSelector } from "../events/RoleSelectorListener.js";
import logger from "../services/logger.js";

@Discord()
export class InteractionHandler {
    private roleSelector = new RoleSelector();
    
    @On({ event: Events.InteractionCreate })
    async onInteraction(interaction: Interaction): Promise<void> {
        try {
            if (interaction.isStringSelectMenu() && interaction.customId === 'select-role') {
                await this.roleSelector.handleRoleSelection(interaction).catch(error => {
                    logger.error(`Ошибка при обработке выбора роли: ${error}`);
                });
            }
        } catch (error) {
            logger.error(`Ошибка при обработке взаимодействия: ${error}`);
        }
    }
}