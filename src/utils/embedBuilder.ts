import { EmbedBuilder, User, Guild, ColorResolvable } from "discord.js";

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

export function createCurrencyTopEmbed(
  topUsers: Array<{user: {discordId: string}, currencyCount: bigint}>, 
  limit: number, 
  requestUser: User, 
  guild?: Guild | null
): EmbedBuilder {
  const medals = ['🥇', '🥈', '🥉'];
  
  let topList = '';
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i];
    const prefix = i < 3 ? medals[i] : `${i + 1}.`;
    topList += `${prefix} <@${user.user.discordId}> — **${user.currencyCount}** 💰\n`;
  }
  
  return createEmbed({
    title: `🏆 Топ ${limit} пользователей по валюте`,
    description: 'Самые богатые пользователи сервера',
    color: EmbedColors.CURRENCY,
    timestamp: true,
    thumbnail: guild?.iconURL() || undefined,
    footer: {
      text: `Запросил ${requestUser.username}`,
      iconURL: requestUser.displayAvatarURL()
    },
    fields: [
      {
        name: 'Рейтинг',
        value: topList || 'Пока никто не заработал валюту'
      }
    ]
  });
}

export function createExpTopEmbed(
  topUsers: Array<{user: {discordId: string}, exp: bigint, level: number}>, 
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

export function createLevelTopEmbed(
  topUsers: Array<{user: {discordId: string}, exp: bigint, level: number}>, 
  limit: number, 
  requestUser: User, 
  guild?: Guild | null
): EmbedBuilder {
  const medals = ['🥇', '🥈', '🥉'];
  
  let topList = '';
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i];
    const prefix = i < 3 ? medals[i] : `${i + 1}.`;
    topList += `${prefix} <@${user.user.discordId}> — **Уровень ${user.level}** (${user.exp} XP)\n`;
  }
  
  return createEmbed({
    title: `⭐ Топ ${limit} пользователей по уровням`,
    description: 'Самые высокоуровневые пользователи сервера',
    color: EmbedColors.EXP,
    timestamp: true,
    thumbnail: guild?.iconURL() || undefined,
    footer: {
      text: `Запросил ${requestUser.username}`,
      iconURL: requestUser.displayAvatarURL()
    },
    fields: [
      {
        name: 'Рейтинг по уровням',
        value: topList || 'Пока никто не заработал уровни'
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

export function createLevelProgressEmbed(targetUser: User, exp: bigint, level: number, nextLevelExp: bigint, requestUser: User): EmbedBuilder {
  const currentExp = exp;
  const remainingExp = nextLevelExp - currentExp;
  const progressPercentage = Number((Number(currentExp) / Number(nextLevelExp) * 100).toFixed(1));
  
  const progressBarTotal = 20; 
  const filledBlocks = Math.floor(progressPercentage / 100 * progressBarTotal);
  const emptyBlocks = progressBarTotal - filledBlocks;
  const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
  
  return createEmbed({
    title: `📊 Прогресс до следующего уровня`,
    description: `<@${targetUser.id}> сейчас на **${level}** уровне`,
    color: EmbedColors.EXP,
    timestamp: true,
    thumbnail: targetUser.displayAvatarURL(),
    footer: {
      text: `Запросил ${requestUser.username}`,
      iconURL: requestUser.displayAvatarURL()
    },
    fields: [
      {
        name: 'Текущий опыт',
        value: `${currentExp}/${nextLevelExp} (${progressPercentage}%)`,
        inline: false
      },
      {
        name: 'Прогресс до уровня ' + (level + 1),
        value: `${progressBar}\nНеобходимо еще: **${remainingExp}** опыта`,
        inline: false
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
      value: `${voiceHours} часов`,
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
  
  return createEmbed({
    title: `Профиль пользователя ${targetUser.username}`,
    description: `Статистика активности <@${targetUser.id}> на сервере`,
    color: EmbedColors.INFO,
    timestamp: true,
    thumbnail: targetUser.displayAvatarURL(),
    footer: {
      text: `ID: ${targetUser.id} • Запросил ${requestUser.username}`,
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