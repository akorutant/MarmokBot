import { CommandInteraction, GuildMember } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import logger from "../services/logger.js";

/**
 * Проверяет, есть ли у пользователя хотя бы одна роль, указанная в записях конфигурации по ключам.
 *
 * @param interaction Объект взаимодействия (CommandInteraction).
 * @param configKeys Массив ключей конфигурации, например ["admin", "high_mod_level"].
 * @returns true, если хотя бы одна роль у пользователя совпадает с указанными в конфиге.
 */
export async function userHasAnyRoleFromConfig(
  interaction: CommandInteraction,
  configKeys: string[]
): Promise<boolean> {
  try {
    const configRepository = AppDataSource.getRepository(Config);
    const configs = await configRepository.findBy([
      ...configKeys.map((key) => ({ key }))
    ]);

    if (!configs || configs.length === 0) {
      logger.error(`Нет конфигураций по ключам: ${configKeys.join(", ")}`);
      return false;
    }

    const allowedRoleIds = configs.map((config) => config.value.trim());
    logger.info("Допустимые роли: %O", allowedRoleIds);

    const member = interaction.member as GuildMember;
    const userRoleIds = member.roles.cache.map((role) => role.id);
    logger.info("Роли пользователя: %O", userRoleIds);

    return userRoleIds.some((roleId) => allowedRoleIds.includes(roleId));
  } catch (error) {
    logger.error("Ошибка при проверке ролей из конфигурации: %O", error);
    return false;
  }
}
