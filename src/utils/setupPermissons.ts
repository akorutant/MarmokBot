import { ApplicationCommandPermissions, ApplicationCommandPermissionType } from "discord.js";
import { getModRoleIds } from "./getModRoleIds.js";
import { config } from 'dotenv';

/**
 * Функция для настройки разрешений для команд с переданным списком ключей
 * @param bot Экземпляр бота
 * @param roleKeys Массив ключей для получения ролей
 */
export async function setupPermissions(bot: any, roleKeys: string[]) {
  try {
    const guildId = process.env.GUILD_ID;

    if (!guildId) {
      console.error("GUILD_ID не найден в переменных окружения.");
      return;
    }

    const modRoleIds = await getModRoleIds(roleKeys);

    if (modRoleIds.length === 0) {
      console.log("Роли не найдены в конфигурации.");
      return;
    }

    const moderatorPermissions: ApplicationCommandPermissions[] = modRoleIds.map(roleId => ({
      id: roleId,
      type: ApplicationCommandPermissionType.Role,
      permission: true,
    }));

    const commands = await bot.guilds.cache.get(guildId)?.commands.fetch();

    if (!commands) {
      console.log("Не удалось получить команды.");
      return;
    }

    const moderatorOnlyCommands = [
      'exp set',
      'exp add',
      'exp remove',
      'currency set',
      'currency add',
      'currency remove',
      'gift set',
      'gift add',
      'gift remove',
      'config add',
      'config remove',
      'config get',
      'config setbackground',
      'config removebackground',
      'modprofile',
    ];

    for (const command of commands.values()) {
      if (moderatorOnlyCommands.includes(command.name) || 
          (command.name === 'exp' && command.options?.some((opt: { name: any; }) => moderatorOnlyCommands.includes(`exp ${opt.name}`)))) {
        await command.permissions.set({
          permissions: moderatorPermissions,
        });
        console.log(`Разрешения для команды "${command.name}" установлены только для модераторов.`);
      } else {
        await command.permissions.set({
          permissions: [], // Нет ограничений, доступ для всех
        });
        console.log(`Команда "${command.name}" доступна для всех.`);
      }
    }
  } catch (error) {
    console.error("Ошибка при настройке разрешений:", error);
  }
}