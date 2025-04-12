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

@Discord()
@SlashGroup({ description: "Commands for managing user EXP", name: "exp" })
@SlashGroup("exp")
class ExpCommands {
  @Slash({ description: "Set user EXP to a specific value" })
  @RequireRoles(["high_mod_level", "medium_mod_level"])
  @EnsureUser()
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

  @Slash({ description: "Add EXP to a user" })
  @RequireRoles(["high_mod_level", "medium_mod_level"])
  @EnsureUser()
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
        await expRepository.save(user.exp);
        
        const levelUpMsg = `\nПользователь повысил уровень до ${newLevel}! 🎉`;
        const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> добавлено EXP: +${expCount}${levelUpMsg}`, interaction.user);
        await interaction.reply({ embeds: [embed] });
      } else {
        const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> добавлено EXP: +${expCount}`, interaction.user);
        await interaction.reply({ embeds: [embed] });
      }
      
      logger.info(`Пользователю ${discordUser.id} добавлено ${expCount} EXP, текущий уровень: ${newLevel}`);

    } catch (error) {
      const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
      await interaction.reply({ embeds: [embed] });
      logger.error("Ошибка при добавлении EXP: %O", error);
    }
  }

  @Slash({ description: "Remove EXP from a user" })
  @RequireRoles(["high_mod_level", "medium_mod_level"])
  @EnsureUser()
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

  @Slash({ description: "Show top users by total EXP" })
  @Guard(ChannelGuard("user_commands_channel"))
  async top(
    @SlashOption({
      description: "Количество пользователей для отображения",
      name: "limit",
      required: false,
      type: ApplicationCommandOptionType.Number
    })
    limit: number = 10,
    interaction: CommandInteraction,
  ) {
    try {
      if (limit <= 0 || limit > 25) {
        limit = 10;
      }

      const expRepository = AppDataSource.getRepository(Exp);

      const topUsers = await expRepository
        .createQueryBuilder("exp")
        .leftJoinAndSelect("exp.user", "user")
        .orderBy("exp.exp", "DESC")
        .take(limit)
        .getMany();

      if (topUsers.length === 0) {
        const embed = createErrorEmbed("На сервере пока нет пользователей с опытом!", interaction.user);
        await interaction.reply({ embeds: [embed] });
        return;
      }

      const embed = createExpTopEmbed(topUsers, limit, interaction.user, interaction.guild);
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
      await interaction.reply({ embeds: [embed] });
      logger.error("Ошибка при получении топа пользователей по опыту: %O", error);
    }
  }
}

export default ExpCommands;