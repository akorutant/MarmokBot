import { EmbedBuilder, User, Guild, ColorResolvable, CommandInteraction } from "discord.js";
import { calculateNextLevelExp } from "./levelUpUtils.js";
import { getHoursString } from "./hoursUtils.js";
import { GiftReward } from "../types/giftTypes.js";
import { CasinoResult } from "../types/casinoTypes.js";
import { RARITY_COLORS } from "../constants/colors.js";
import { pluralizeGifts } from "./giftUtils.js";
import { GiftStats } from "../entities/GiftStats.js";
import { TopEmbedOptions, TopUser } from "../types/embedTypes.js";

export enum EmbedColors {
  DEFAULT = 0x5865F2,
  SUCCESS = 0x57F287,
  WARNING = 0xFEE75C,
  ERROR = 0xED4245,
  INFO = 0x5DADE2,
  CURRENCY = 0xF1C40F,
  EXP = 0x9B59B6,
  GAME = 0xFCE83B
}

interface EmbedOptions {
  title?: string;
  description?: string;
  color?: ColorResolvable;
  timestamp?: boolean;
  thumbnail?: string;
  footer?: {
    text: string;
    iconURL?: string;
  };
  author?: {
    name: string;
    iconURL?: string;
    url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

export function createEmbed(options: EmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(options.color || EmbedColors.DEFAULT);

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.timestamp) embed.setTimestamp();
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);

  if (options.footer) {
    embed.setFooter({
      text: options.footer.text,
      iconURL: options.footer.iconURL
    });
  }

  if (options.author) {
    embed.setAuthor({
      name: options.author.name,
      iconURL: options.author.iconURL,
      url: options.author.url
    });
  }

  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }

  return embed;
}

export function createErrorEmbed(message: string, user?: User): EmbedBuilder {
  return createEmbed({
    title: '❌ Ошибка',
    description: message,
    color: EmbedColors.ERROR,
    timestamp: true,
    footer: user ? {
      text: `Запросил ${user.username}`,
      iconURL: user.displayAvatarURL()
    } : undefined
  });
}

export function createSuccessEmbed(message: string, user?: User): EmbedBuilder {
  return createEmbed({
    title: '✅ Успешно',
    description: message,
    color: EmbedColors.SUCCESS,
    timestamp: true,
    footer: user ? {
      text: `Запросил ${user.username}`,
      iconURL: user.displayAvatarURL()
    } : undefined
  });
}


export function createTopEmbed(
  topUsers: TopUser[],
  limit: number,
  requestUser: User,
  guild?: Guild | null,
  options?: TopEmbedOptions
): EmbedBuilder {
  const medals = ['🥇', '🥈', '🥉'];

  let topList = '';
  for (let i = 0; i < topUsers.length; i++) {
    const { user, value } = topUsers[i];
    const prefix = i < 3 ? medals[i] : `${i + 1}.`;

    const display = options?.formatValue
      ? options.formatValue(value, i)
      : value;

    const icon = options?.icon ?? '';
    topList += `${prefix} <@${user.discordId}> — **${display}** ${icon}\n`;
  }

  return createEmbed({
    title: options?.title ?? `🏆 Топ ${limit} пользователей`,
    description: options?.description ?? 'Рейтинг активности пользователей',
    color: options?.color ?? EmbedColors.DEFAULT,
    timestamp: true,
    thumbnail: guild?.iconURL() ?? undefined,
    footer: {
      text: `Запросил ${requestUser.username}`,
      iconURL: requestUser.displayAvatarURL()
    },
    fields: [
      {
        name: 'Рейтинг',
        value: topList || 'Пока нет данных для отображения.'
      }
    ]
  });
}

export function createExpTopEmbed(
  topUsers: Array<{ user: { discordId: string }, exp: bigint, level: number }>,
  limit: number,
  requestUser: User,
  guild?: Guild | null
): EmbedBuilder {
  const medals = ['🥇', '🥈', '🥉'];

  let topList = '';
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i];
    const prefix = i < 3 ? medals[i] : `${i + 1}.`;
    topList += `${prefix} <@${user.user.discordId}> — **${user.exp}** XP (уровень ${user.level})\n`;
  }

  return createEmbed({
    title: `🌟 Топ ${limit} пользователей по опыту`,
    description: 'Самые опытные пользователи сервера',
    color: EmbedColors.EXP,
    timestamp: true,
    thumbnail: guild?.iconURL() || undefined,
    footer: {
      text: `Запросил ${requestUser.username}`,
      iconURL: requestUser.displayAvatarURL()
    },
    fields: [
      {
        name: 'Рейтинг по опыту',
        value: topList || 'Пока никто не заработал опыт'
      }
    ]
  });
}

export function createCurrencyBalanceEmbed(targetUser: User, amount: bigint, requestUser: User): EmbedBuilder {
  return createEmbed({
    title: `💰 Баланс пользователя`,
    description: `<@${targetUser.id}> имеет **${amount}** $`,
    color: EmbedColors.CURRENCY,
    timestamp: true,
    thumbnail: targetUser.displayAvatarURL(),
    footer: {
      text: `Запросил ${requestUser.username}`,
      iconURL: requestUser.displayAvatarURL()
    }
  });
}

export function createExpEmbed(targetUser: User, exp: bigint, level: number, requestUser: User): EmbedBuilder {
  return createEmbed({
    title: `⭐ Уровень и опыт пользователя`,
    description: `<@${targetUser.id}> имеет **${exp}** опыта`,
    color: EmbedColors.EXP,
    timestamp: true,
    thumbnail: targetUser.displayAvatarURL(),
    footer: {
      text: `Запросил ${requestUser.username}`,
      iconURL: requestUser.displayAvatarURL()
    },
    fields: [
      {
        name: 'Текущий уровень',
        value: `${level}`,
        inline: true
      }
    ]
  });
}


export function createProfileEmbed(
  targetUser: User,
  messageCount: bigint,
  voiceMinutes: bigint,
  exp: bigint | undefined,
  level: number | undefined,
  currency: bigint | undefined,
  requestUser: User
): EmbedBuilder {
  const voiceHours = Math.round(Number(voiceMinutes) / 6) / 10;
  const hoursString = getHoursString(voiceHours);
  const fields = [];

  if (level !== undefined) {
    fields.push({
      name: "⭐ Уровень",
      value: `**${level}**`,
      inline: true
    });
  }

  if (exp !== undefined) {
    fields.push({
      name: "🌟 Опыт",
      value: `**${exp}** XP`,
      inline: true
    });
  }

  fields.push(
    {
      name: "📝 Сообщений",
      value: messageCount.toString(),
      inline: true
    },
    {
      name: "🎙️ В голосовых каналах",
      value: `${voiceHours} ${hoursString}`,
      inline: true
    }
  );

  if (currency !== undefined) {
    fields.push({
      name: "💰 Баланс",
      value: `${currency} $`,
      inline: true
    });
  }

  if (exp !== undefined && level !== undefined) {
    if (level < 20) {
      const nextLevelExp = calculateNextLevelExp(level);
      const remainingExp = nextLevelExp - exp;
      const progressPercentage = Number((Number(exp) / Number(nextLevelExp) * 100).toFixed(1));

      const progressBarTotal = 20;
      const filledBlocks = Math.floor(Number(progressPercentage) / 100 * progressBarTotal);
      const emptyBlocks = progressBarTotal - filledBlocks;
      const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

      fields.push(
        {
          name: "📊 Прогресс",
          value: `${progressBar}\n${progressPercentage}% до уровня ${level + 1}`,
          inline: false
        }
      );
    }
  }

  return createEmbed({
    title: `Профиль ${targetUser.username}`,
    description: `Статистика пользователя <@${targetUser.id}>`,
    color: EmbedColors.INFO,
    timestamp: true,
    thumbnail: targetUser.displayAvatarURL(),
    footer: {
      text: `Запросил ${requestUser.username}`,
      iconURL: requestUser.displayAvatarURL()
    },
    fields: fields
  });
}
export function createCoinflipEmbed(
  userBet: Number,
  targetUser: User,
  userSide?: String,
  winMoney?: Number,
  result?: Number,
  botSide?: String,
): EmbedBuilder {
  let coinDescription = "Монетка в воздухе...";
  const fields = [];

  if (userSide !== undefined) {
    if (userSide == "eagle") {
      userSide = "Орёл";
    } else {
      userSide = "Решка"
    }
  }

  if (userBet !== undefined) {

    fields.push({
      name: "Ваша ставка",
      value: `${userSide}, ${userBet}$`,
      inline: true
    })
  }

  if (botSide !== undefined) {
    if (botSide == "eagle") {
      botSide = "орлом";
    } else {
      botSide = "решкой"
    }
    coinDescription = `Монетка упала ${botSide}`;
  }

  if (result == 1 && result !== undefined) {
    fields.push({
      name: "Вы выиграли!",
      value: `Сумма выигрыша ${winMoney}$`,
      inline: true
    })
  }

  return createEmbed({
    title: `${targetUser.username} подбросил монетку!`,
    description: coinDescription,
    color: EmbedColors.GAME,
    timestamp: true,
    thumbnail: targetUser.displayAvatarURL(),
    footer: {
      text: `Играет ${targetUser.username}`,
      iconURL: targetUser.displayAvatarURL()
    },
    fields: fields
  });
}

export function createDuelEmbed(
  userBet: number,
  executeUser: User,
  targetUser?: User,
  winMoney?: number,
  winUser?: User,
  expireTimestamp?: number,  
  expired?: boolean
): EmbedBuilder {
  let duelDescription = "";

  if (winUser) {
    duelDescription = "💥 Итоги схватки.";
  } else if (expired) {
    duelDescription = "⏰ Время на принятие дуэли истекло.";
  } else if (expireTimestamp) {
    duelDescription = `⚔️ Вы можете принять дуэль кнопкой ниже\n🕒 Осталось времени: <t:${expireTimestamp}:R>`;
  } else {
    duelDescription = "⚔️ Вы можете принять дуэль кнопкой ниже.";
  }

  const fields: { name: string; value: string; inline: boolean }[] = [];

  fields.push({
    name: "💰 Ставка",
    value: `**${userBet}$**`,
    inline: true
  });

  if (winUser && targetUser) {
    const loser = targetUser.id === winUser.id ? executeUser : targetUser;
    fields.push(
      {
        name: "🏆 Победитель",
        value: `<@${winUser.id}>`,
        inline: true
      },
      {
        name: "🤕 Дуэлянт",
        value: `<@${loser.id}>`,
        inline: true
      },
      {
        name: "🎉 Выигрыш",
        value: `**${winMoney}$**`,
        inline: true
      }
    );
  } else if (targetUser) {
    fields.push({
      name: "🤺 Противник",
      value: `<@${targetUser.id}>`,
      inline: true
    });
  }

  return createEmbed({
    title: expired
      ? `❌ Дуэль отменена`
      : winUser
        ? `🏁 Дуэль завершена`
        : `⚔️ ${executeUser.username} вызывает на дуэль!`,
    description: duelDescription,
    color: expired
      ? EmbedColors.ERROR
      : winUser
        ? EmbedColors.SUCCESS
        : EmbedColors.GAME,
    timestamp: true,
    thumbnail: executeUser.displayAvatarURL(),
    footer: {
      text: `Инициатор: ${executeUser.username}`,
      iconURL: executeUser.displayAvatarURL()
    },
    fields
  });
}



/**
 * Создает эмбед с результатами открытия подарка
 * @param results Результаты открытия подарка
 * @param totalWin Общая сумма выигрыша
 * @param totalCost Общая стоимость подарка
 * @param interaction Объект взаимодействия
 * @returns Объект эмбеда с результатами
 */
export function createGiftResultEmbed(
  results: GiftReward[],
  totalWin: number,
  totalCost: number,
  interaction: CommandInteraction
): EmbedBuilder {
  const profit = totalWin - totalCost;
  const isProfit = profit > 0;
  
  const embedColor = isProfit ? RARITY_COLORS.legendary : 
                    (totalWin === 0 ? RARITY_COLORS.common : RARITY_COLORS.rare);
  
  const embed = new EmbedBuilder()
      .setTitle(`✨ 🎁 ОТКРЫТИЕ ${pluralizeGifts(results.length).toUpperCase()} 🎁 ✨`)
      .setDescription(`<@${interaction.user.id}> открывает ${results.length} ${pluralizeGifts(results.length)}...`)
      .setColor(embedColor)
      .setTimestamp()
      .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
  
  let valueText = '';
  let rewardTitle = 'Награда за подарки';
  for (let result of results){
    if (result.type === 'nothing') {
      valueText += `${result.emoji} Пусто\n`
    } else {
      valueText += `${result.emoji} ${result.name} - ${result.amount}$\n`
    }
  }

  embed.addFields({
      name: rewardTitle,
      value: `\`\`\`${valueText}\`\`\``
  });
  
  embed.addFields(
      {
          name: `${isProfit ? '📈' : '📉'} Итог`,
          value: `\`${profit > 0 ? '+' : ''}${profit}$\``,
          inline: true
      }
  );
  
  if (isProfit) {
      embed.setFooter({ 
          text: '🍀 Удача улыбнулась вам! Поздравляем с прибылью!',
          iconURL: interaction.user.displayAvatarURL()
      });
  } else if (totalWin === 0) {
      embed.setFooter({ 
          text: '😔 В следующий раз фортуна обязательно повернется к вам лицом!',
          iconURL: interaction.user.displayAvatarURL()
      });
  } else {
      embed.setFooter({ 
          text: '🎲 По статистике 90% потенциальных миллионеров останавливается перед выигрышем...',
          iconURL: interaction.user.displayAvatarURL()
      });
  }
  
  return embed;
}

/**
 * Создает эмбед с результатами игры в казино
 * @param bet Размер ставки
 * @param winAmount Сумма выигрыша
 * @param result Результат игры (множитель, эмодзи, описание)
 * @param interaction Объект взаимодействия
 * @returns Объект эмбеда с результатами
 */
export function createCasinoResultEmbed(
  bet: number,
  winAmount: number,
  result: CasinoResult,
  interaction: CommandInteraction
): EmbedBuilder {
  const profit = winAmount - bet;
  const isWin = profit > 0;
  
  const embedColor = profit > 0 ? RARITY_COLORS.legendary : 
                    (winAmount === bet ? RARITY_COLORS.rare : RARITY_COLORS.common);
  
  const embed = new EmbedBuilder()
      .setTitle(`${result.emoji} 🎰 КАЗИНО 🎰 ${result.emoji}`)
      .setDescription(`<@${interaction.user.id}> делает ставку и наблюдает за вращением колеса фортуны...`)
      .setColor(embedColor)
      .setTimestamp()
      .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
  
  let resultBlock;
  if (profit > 0) {
      resultBlock = `\`\`\`diff\n+ ${result.description}\n\`\`\``;
  } else if (winAmount === bet) {
      resultBlock = `\`\`\`fix\n${result.description}\n\`\`\``;
  } else {
      resultBlock = `\`\`\`diff\n- ${result.description}\n\`\`\``;
  }
  
  embed.addFields({
      name: `${result.emoji} Результат:`,
      value: resultBlock
  });
  
  embed.addFields({
      name: '┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅',
      value: '📊 **Финансовый отчет** 📊'
  });
  
  embed.addFields(
      {
          name: '💰 Ставка',
          value: `\`${bet}$\``,
          inline: true
      },
      {
          name: '💸 Выигрыш',
          value: `\`${winAmount}$\``,
          inline: true
      },
      {
          name: `${isWin ? '📈' : '📉'} Профит`,
          value: `\`${profit > 0 ? '+' : ''}${profit}$\``,
          inline: true
      }
  );
  
  if (isWin) {
      embed.setFooter({ 
          text: '🍀 Удача на вашей стороне! Поздравляем с выигрышем!',
          iconURL: interaction.user.displayAvatarURL()
      });
  } else if (winAmount === bet) {
      embed.setFooter({ 
          text: '🎲 Вы вернули свою ставку. Ни выигрыша, ни проигрыша.',
          iconURL: interaction.user.displayAvatarURL()
      });
  } else {
      embed.setFooter({ 
          text: '💸 По статистике 90% потенциальных миллионеров останавливаются перед выигрышем...',
          iconURL: interaction.user.displayAvatarURL()
      });
  }
  
  return embed;
}

export function createGiftListEmbed(
  user: User,
  totalVoiceMinutes: number,
  availableGifts: number,
  claimedGifts: number,
  hoursForNextGift: number,
  remainingMinutes: number,
  giftStats: GiftStats
): EmbedBuilder {
  const fields = [];
  
  fields.push({
    name: "⏱️ Всего времени в голосовых каналах:",
    value: `**${Math.floor(totalVoiceMinutes / 60)} ч ${totalVoiceMinutes % 60}**`,
  })

  fields.push({
    name: "🎁 Доступно:",
    value: `**${availableGifts} ${pluralizeGifts(availableGifts)}**`,
  })

  fields.push({
    name: "🔄 Получено за голос:",
    value: `**${claimedGifts} ${pluralizeGifts(claimedGifts)}**`,
  })
  

  fields.push({
    name: "⏳ До следующего",
    value: `**${hoursForNextGift} ч ${remainingMinutes} мин**`,
  })

  fields.push({
    name: "🎁 Всего открыто: ",
    value: `**${giftStats.totalGiftsClaimed} ${pluralizeGifts(giftStats.totalGiftsClaimed)}**`,
  })
  

  return createEmbed({
    title: `Информация о ваших подарках`,
    color: EmbedColors.GAME,
    timestamp: true,
    thumbnail: user.displayAvatarURL(),
    footer: {
      text: `Подарки накапливаются за каждые 8 часов`,
      iconURL: user.displayAvatarURL()
    },
    fields: fields
  });
}