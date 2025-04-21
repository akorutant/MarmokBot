import {
  Discord,
  SlashGroup,
  Slash,
  SlashOption,
  Guard
} from "discordx";
import {
  CommandInteraction,
  User as DiscordUser,
  ApplicationCommandOptionType
} from "discord.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Exp } from "../entities/Exp.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { getMaxLevelForExp } from "../utils/levelUpUtils.js";
import {
  createErrorEmbed,
  createSuccessEmbed,
  createExpTopEmbed,
  createExpEmbed
} from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";

@Discord()
@SlashGroup({ 
  description: "Команды для изменения EXP", 
  name: "exp",
  defaultMemberPermissions: "0", 
  dmPermission: false, 
})
@SlashGroup("exp")
class ExpCommands {
  @Slash({ description: "Установить кол-во EXP пользователю" })
  @EnsureUser()
  @Guard(
      EnsureUserGuard(),
      RequireRoles(["high_mod_level", "medium_mod_level"])
  )
  async set(
    @SlashOption({
      description: "Выберите пользователя",
      name: "user",
      required: true,
      type: ApplicationCommandOptionType.User
    })
    discordUser: DiscordUser,
    @SlashOption({
      description: "Напишите кол-во EXP для установления пользователю",
      name: "exp",
      required: true,
      type: ApplicationCommandOptionType.Number
    })
    expCount: number,
    interaction: CommandInteraction,
  ) {
    try {
      const expRepository = AppDataSource.getRepository(Exp);

      const user = await AppDataSource.getRepository(User).findOneOrFail({
        where: { discordId: discordUser.id },
        relations: ["exp"]
      });

      user.exp.exp = BigInt(expCount);
      user.exp.level = getMaxLevelForExp(user.exp.exp);

      await expRepository.save(user.exp);
      logger.info(`Пользователю ${discordUser.id} установлено ${expCount} EXP и уровень ${user.exp.level}`);

      const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> установлено ${expCount} EXP (уровень ${user.exp.level})`, interaction.user);
      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
      await interaction.reply({ embeds: [embed] });
      logger.error("Ошибка при установке EXP: %O", error);
    }
  }

  @Slash({ description: "Добавить кол-во EXP пользователю" })
  @EnsureUser()
  @Guard(
    EnsureUserGuard(),
    RequireRoles(["high_mod_level", "medium_mod_level"])
  )
  async add(
    @SlashOption({
      description: "Выберите пользователя",
      name: "user",
      required: true,
      type: ApplicationCommandOptionType.User
    })
    discordUser: DiscordUser,
    @SlashOption({
      description: "Напишите кол-во EXP для добавления",
      name: "exp",
      required: true,
      type: ApplicationCommandOptionType.Number
    })
    expCount: number,
    interaction: CommandInteraction,
  ) {
    try {
      const expRepository = AppDataSource.getRepository(Exp);

      const user = await AppDataSource.getRepository(User).findOneOrFail({
        where: { discordId: discordUser.id },
        relations: ["exp"]
      });

      const oldLevel = user.exp.level;
      await expRepository.increment({ id: user.exp.id }, "exp", expCount);

      const newExp = await expRepository.findOneOrFail({ where: { id: user.exp.id } });
      const newLevel = getMaxLevelForExp(newExp.exp);

      if (newLevel !== oldLevel) {
        user.exp.level = newLevel;
        const levelUpMsg = `\nПользователь повысил уровень до ${newLevel}! 🎉`;
        const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> добавлено EXP: +${expCount}${levelUpMsg}`, interaction.user);
        await interaction.reply({ embeds: [embed] });
      } else {
        const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> добавлено EXP: +${expCount}`, interaction.user);
        await interaction.reply({ embeds: [embed] });
      }
      await expRepository.save(user.exp);

      logger.info(`Пользователю ${discordUser.id} добавлено ${expCount} EXP, текущий уровень: ${newLevel}`);

    } catch (error) {
      const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
      await interaction.reply({ embeds: [embed] });
      logger.error("Ошибка при добавлении EXP: %O", error);
    }
  }

  @Slash({ description: "Снять EXP у пользователя" })
  @EnsureUser()
  @Guard(
    EnsureUserGuard(),
    RequireRoles(["high_mod_level", "medium_mod_level"])
  )
  async remove(
    @SlashOption({
      description: "Выберите пользователя",
      name: "user",
      required: true,
      type: ApplicationCommandOptionType.User
    })
    discordUser: DiscordUser,
    @SlashOption({
      description: "Напишите кол-во EXP для вычитания",
      name: "exp",
      required: true,
      type: ApplicationCommandOptionType.Number
    })
    expCount: number,
    interaction: CommandInteraction,
  ) {
    try {
      const expRepository = AppDataSource.getRepository(Exp);

      const user = await AppDataSource.getRepository(User).findOneOrFail({
        where: { discordId: discordUser.id },
        relations: ["exp"]
      });

      const oldLevel = user.exp.level;
      const currentExp = Number(user.exp.exp);
      const finalExp = Math.max(0, currentExp - expCount);
      const actualDecrease = currentExp - finalExp;

      user.exp.exp = BigInt(finalExp);
      const newLevel = getMaxLevelForExp(user.exp.exp);

      if (newLevel !== oldLevel) {
        user.exp.level = newLevel;
        await expRepository.save(user.exp);

        const levelDownMsg = `\nУровень пользователя понизился до ${newLevel}.`;
        const embed = createSuccessEmbed(`У пользователя <@${discordUser.id}> вычтено EXP: -${actualDecrease}${levelDownMsg}`, interaction.user);
        await interaction.reply({ embeds: [embed] });
      } else {
        await expRepository.save(user.exp);
        const embed = createSuccessEmbed(`У пользователя <@${discordUser.id}> вычтено EXP: -${actualDecrease}`, interaction.user);
        await interaction.reply({ embeds: [embed] });
      }

      logger.info(`У пользователя ${discordUser.id} вычтено ${actualDecrease} EXP, текущий уровень: ${newLevel}`);

    } catch (error) {
      const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
      await interaction.reply({ embeds: [embed] });
      logger.error("Ошибка при удалении EXP: %O", error);
    }
  }
}

export default ExpCommands;