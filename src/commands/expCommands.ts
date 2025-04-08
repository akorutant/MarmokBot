import { Discord, SlashGroup, Slash, SlashOption } from "discordx";
import { CommandInteraction, User as DiscordUser, ApplicationCommandOptionType } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Exp } from "../entities/Exp.js";
import logger from "../services/logger.js";

@Discord()
@SlashGroup({ description: "Commands for managing user EXP", name: "exp" })
@SlashGroup("exp")
class ExpCommands {
  @Slash({ description: "Set user EXP to a specific value" })
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

      if (user) {
        if (user.exp) {
          user.exp.exp = BigInt(expCount);
          await expRepository.save(user.exp);
          logger.info(`Пользователю ${discordUser.id} установлено ${expCount} EXP`);
        } else {
          const newExp = expRepository.create({ exp: BigInt(expCount), user });
          await expRepository.save(newExp);
          logger.info(`Пользователю ${discordUser.id} установлено ${expCount} EXP`);
        }
      } else {
        const newUser = userRepository.create({
          discordId: discordUser.id,
          messageCount: 0n,
          voiceMinutes: 0n
        });
        await userRepository.save(newUser);

        const newExp = expRepository.create({ exp: BigInt(expCount), user: newUser });
        await expRepository.save(newExp);
        logger.info(`Создан новый пользователь ${discordUser.id} со значением EXP ${expCount}`);
      }

      await interaction.reply(`Пользователю <@${discordUser.id}> установлено EXP = ${expCount}`);
    } catch (error) {
      await interaction.reply("Ошибка! За подробностями обратитесь к разработчикам.");
      logger.error("Ошибка при установке EXP для пользователя %s: %O", discordUser.id, error);
    }
  }

  @Slash({ description: "Add EXP to a user" })
  async add(
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

      if (user) {
        if (user.exp) {
          await expRepository.increment({ id: user.exp.id }, "exp", expCount);
          logger.info(`Пользователю ${discordUser.id} добавлено ${expCount} EXP`);
        } else {
          const newExp = expRepository.create({ exp: BigInt(expCount), user });
          await expRepository.save(newExp);
          logger.info(`Пользователю ${discordUser.id} добавлено ${expCount} EXP`);
        }
      } else {
        const newUser = userRepository.create({
          discordId: discordUser.id,
          messageCount: 0n,
          voiceMinutes: 0n
        });
        await userRepository.save(newUser);

        const newExp = expRepository.create({ exp: BigInt(expCount), user: newUser });
        await expRepository.save(newExp);
        logger.info(`Создан новый пользователь ${discordUser.id} и добавлено ${expCount} EXP`);
      }

      await interaction.reply(`Пользователю <@${discordUser.id}> добавлено EXP: +${expCount}`);
    } catch (error) {
      await interaction.reply("Ошибка! За подробностями обратитесь к разработчикам.");
      logger.error("Ошибка при добавлении EXP для пользователя %s: %O", discordUser.id, error);
    }
  }

  @Slash({ description: "Remove EXP from a user" })
  async remove(
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
        await expRepository.increment({ id: user.exp.id }, "exp", -expCount);
        logger.info(`У пользователя ${discordUser.id} вычтено ${expCount} EXP`);
        await interaction.reply(`У пользователя <@${discordUser.id}> вычтено EXP: -${expCount}`);
      } else {
        await interaction.reply(`Пользователь <@${discordUser.id}> не найден или у него нет EXP для вычитания`);
      }
    } catch (error) {
      await interaction.reply("Ошибка! За подробностями обратитесь к разработчикам.");
      logger.error("Ошибка при удалении EXP для пользователя %s: %O", discordUser.id, error);
    }
  }
}
