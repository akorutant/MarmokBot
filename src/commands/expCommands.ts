import { Discord, SlashGroup, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, User as DiscordUser, ApplicationCommandOptionType, GuildMember } from "discord.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Exp } from "../entities/Exp.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { 
  createEmbed, 
  createErrorEmbed, 
  createSuccessEmbed,
  createExpTopEmbed,
  createLevelTopEmbed
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
      const userRepository = AppDataSource.getRepository(User);
      const expRepository = AppDataSource.getRepository(Exp);

      let user = await userRepository.findOne({
        where: { discordId: discordUser.id },
        relations: ["exp"]
      });

      if (user && user.exp) {
        user.exp.exp = BigInt(expCount);
        await expRepository.save(user.exp);
        logger.info(`Пользователю ${discordUser.id} установлено ${expCount} EXP`);
      }

      const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> установлено EXP = ${expCount}`, interaction.user);
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
      const userRepository = AppDataSource.getRepository(User);
      const expRepository = AppDataSource.getRepository(Exp);

      let user = await userRepository.findOne({
        where: { discordId: discordUser.id },
        relations: ["exp"]
      });

      if (user && user.exp) {
        await expRepository.increment({ id: user.exp.id }, "exp", expCount);
        logger.info(`Пользователю ${discordUser.id} добавлено ${expCount} EXP`);
      }

      const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> добавлено EXP: +${expCount}`, interaction.user);
      await interaction.reply({ embeds: [embed] });
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
      const userRepository = AppDataSource.getRepository(User);
      const expRepository = AppDataSource.getRepository(Exp);

      let user = await userRepository.findOne({
        where: { discordId: discordUser.id },
        relations: ["exp"]
      });

      if (user && user.exp) {
        await expRepository.increment({ id: user.exp.id }, "exp", -expCount);
        logger.info(`У пользователя ${discordUser.id} вычтено ${expCount} EXP`);
        
        const embed = createSuccessEmbed(`У пользователя <@${discordUser.id}> вычтено EXP: -${expCount}`, interaction.user);
        await interaction.reply({ embeds: [embed] });
      } else {
        const embed = createErrorEmbed(`Пользователь <@${discordUser.id}> не найден или у него нет EXP`, interaction.user);
        await interaction.reply({ embeds: [embed] });
      }
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

  @Slash({ description: "Show top users by level" })
  @Guard(ChannelGuard("user_commands_channel"))
  async toplevels(
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
        .orderBy("exp.level", "DESC")
        .addOrderBy("exp.exp", "DESC") 
        .take(limit)
        .getMany();

      if (topUsers.length === 0) {
        const embed = createErrorEmbed("На сервере пока нет пользователей с уровнями!", interaction.user);
        await interaction.reply({ embeds: [embed] });
        return;
      }

      const embed = createLevelTopEmbed(topUsers, limit, interaction.user, interaction.guild);
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
      await interaction.reply({ embeds: [embed] });
      logger.error("Ошибка при получении топа пользователей по уровням: %O", error);
    }
  }
}

export default ExpCommands;