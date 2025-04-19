import type { CommandInteraction } from "discord.js";
import { userHasAnyRoleFromConfig } from "../userHasAnyRoleFromConfig.js";

export function RequireRoles(configKeys: string[]) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (interaction: CommandInteraction, ...args: any[]) {
      const hasAccess = await userHasAnyRoleFromConfig(interaction, configKeys);

      if (!hasAccess) {
        await interaction.reply({
          content: "❌ У вас нет прав для использования этой команды.",
          ephemeral: true
        });
        return;
      }

      return originalMethod.apply(this, [interaction, ...args]);
    };

    return descriptor;
  };
}