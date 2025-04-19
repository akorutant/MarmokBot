import { AppDataSource } from "../../services/database.js";
import { User } from "../../entities/User.js";
import { Exp } from "../../entities/Exp.js";
import { Currency } from "../../entities/Currency.js";
import { TextChannel, EmbedBuilder, Client, GuildMember } from "discord.js";
import logger from "../../services/logger.js";
import { calculateNextLevelExp, getMaxLevelForExp } from "../levelUpUtils.js";
import { RARITY_COLORS } from "../../constants/colors.js";

let discordClient: Client | undefined = undefined;

export function setDiscordClient(client: Client) {
  discordClient = client;
}

/**
 * Декоратор, который проверяет повышение уровня и отправляет сообщение в чат.
 * Также выдает награду за повышение уровня - количество валюты, равное уровню*100.
 */
export function CheckLevelUp() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Выполняем оригинальный метод
      await originalMethod.apply(this, args);

      try {
        let discordId: string | undefined;
        const firstArg = args[0];

        // Определяем Discord ID пользователя из аргументов
        if (typeof firstArg === 'string') {
          discordId = firstArg;
        } else if (firstArg?.author?.id) {
          discordId = firstArg.author.id;
        } else if (firstArg?.[0]?.member?.id || firstArg?.[1]?.member?.id) {
          discordId = (firstArg[1]?.member?.id || firstArg[0]?.member?.id);
        } else if (args.find(arg => arg?.user?.id)) {
          const interaction = args.find(arg => arg?.user?.id);
          discordId = interaction.user.id;
        }

        if (!discordId) {
          return;
        }

        // Проверяем, повысился ли уровень
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
          where: { discordId },
          relations: ["exp", "currency"],
        });

        if (!user || !user.exp) {
          logger.warn(`CheckLevelUp: Не найден пользователь или exp для ${discordId}`);
          return;
        }

        // Получаем текущий уровень и exp
        const currentExp = Number(user.exp.exp);
        const oldLevel = user.exp.level;

        // Вычисляем максимальный уровень для текущего exp
        const newLevel = getMaxLevelForExp(BigInt(currentExp));

        // Если уровень повысился
        if (newLevel > oldLevel) {
          logger.info(`Пользователь ${discordId} повысил уровень с ${oldLevel} до ${newLevel}`);

          // Обновляем уровень в базе данных
          const expRepository = AppDataSource.getRepository(Exp);
          await expRepository.update(
            { id: user.exp.id },
            { level: newLevel }
          );

          // Выдаем награду за повышение уровня - 100 валюты за каждый уровень
          const currencyRepository = AppDataSource.getRepository(Currency);
          const levelReward = newLevel * 100;
          
          await currencyRepository.increment(
            { id: user.currency.id },
            "currencyCount",
            levelReward
          );
          
          logger.info(`Пользователь ${discordId} получил ${levelReward}$ за повышение до уровня ${newLevel}`);

          // Отправляем сообщение о повышении уровня
          await sendLevelUpMessage(discordId, newLevel, levelReward);
        }
      } catch (error) {
        logger.error(`CheckLevelUp: ошибка при проверке уровня: ${error}`);
      }
    };

    return descriptor;
  };
}

/**
 * Отправляет сообщение о повышении уровня в чат
 */
async function sendLevelUpMessage(
  discordId: string,
  newLevel: number,
  reward: number
) {
  try {
    if (!discordClient) {
      logger.error("Discord Client не инициализирован для отправки сообщения о повышении уровня");
      return;
    }

    // Получаем объект пользователя Discord
    const user = await discordClient.users.fetch(discordId);
    if (!user) {
      logger.warn(`Не удалось получить пользователя Discord ${discordId}`);
      return;
    }

    const guild = discordClient.guilds.cache.first();
    if (!guild) {
      logger.warn("Не удалось получить гильдию для отправки сообщения о повышении уровня");
      return;
    }

    // Находим канал для отправки сообщения
    const channel = guild.channels.cache.find(
      ch => ch.name === "level-ups" || ch.name === "уровни"
    ) as TextChannel;

    if (!channel) {
      // Если не найден специальный канал, используем общий канал
      const generalChannel = guild.channels.cache.find(
        ch => ch.name === "general" || ch.name === "main" || ch.name === "общий"
      ) as TextChannel;

      if (!generalChannel) {
        logger.warn("Не найден канал для отправки сообщения о повышении уровня");
        
        // Отправляем сообщение в ЛС вместо канала
        try {
          const dm = await user.createDM();
          
          const dmEmbed = new EmbedBuilder()
            .setColor(RARITY_COLORS.legendary)
            .setTitle(`🎉 Уровень повышен!`)
            .setDescription(`Поздравляем! Вы достигли **${newLevel}** уровня!`)
            .addFields(
              { name: '💰 Награда', value: `${reward}$`, inline: true },
            )
            .setTimestamp()
            .setFooter({ text: `Поздравляем с повышением уровня!` });
            
          await dm.send({ embeds: [dmEmbed] });
          logger.info(`Отправлено сообщение о повышении уровня в ЛС для ${user.tag}`);
        } catch (dmError) {
          logger.error(`Не удалось отправить ЛС о повышении уровня: ${dmError}`);
        }
        
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS.legendary)
        .setTitle(`🎉 Повышение уровня!`)
        .setDescription(`<@${discordId}> достиг **${newLevel}** уровня!`)
        .addFields(
          { name: '💰 Награда', value: `${reward}$`, inline: true },
        )
        .setTimestamp();

      await generalChannel.send({ embeds: [embed] });
      logger.info(`Отправлено сообщение о повышении уровня в общий канал для ${user.tag}`);
      return;
    }

    // Отправляем сообщение в специальный канал для уровней
    const embed = new EmbedBuilder()
      .setColor(RARITY_COLORS.legendary)
      .setTitle(`✨ Новый уровень! ✨`)
      .setDescription(`<@${discordId}> повысил свой уровень до **${newLevel}**!`)
      .addFields(
        { name: '💰 Награда за уровень', value: `${reward}$`, inline: true },
      )
      .setTimestamp()
      .setThumbnail(user.displayAvatarURL({ size: 256 }));

    await channel.send({ embeds: [embed] });
    logger.info(`Отправлено сообщение о повышении уровня в канал ${channel.name} для ${user.tag}`);

  } catch (error) {
    logger.error(`Ошибка при отправке сообщения о повышении уровня: ${error}`);
  }
}