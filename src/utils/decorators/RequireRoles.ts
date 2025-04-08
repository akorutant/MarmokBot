import type { CommandInteraction } from "discord.js";
import { userHasAnyRoleFromConfig } from "../userHasAnyRoleFromConfig.js";

export function RequireRoles(configKeys: string[]) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const interaction: CommandInteraction = args.find(
        (arg) => arg?.reply && arg?.guild
      );

      if (!interaction) {
        throw new Error("Interaction not found in method arguments.");
      }

      const hasAccess = await userHasAnyRoleFromConfig(interaction, configKeys);

      if (!hasAccess) {
        await interaction.reply({
          content: "❌ У вас нет прав для использования этой команды.",
          ephemeral: true
        });
        return;
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
