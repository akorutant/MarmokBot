import { GuardFunction } from "discordx";
import { 
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
  Interaction,
  InteractionReplyOptions,
  CacheType
} from "discord.js";
import { ApplicationCommandOptionType, User as DiscordUser } from "discord.js";
import { AppDataSource } from "../../services/database.js";
import { User } from "../../entities/User.js";
import { Exp } from "../../entities/Exp.js";
import { Currency } from "../../entities/Currency.js";
import { GiftStats } from "../../entities/GiftStats.js";
import logger from "../../services/logger.js";

export function EnsureUserGuard(): GuardFunction<Interaction> {
    return async (interaction, _, next) => {
      try {
        const commandUsers: DiscordUser[] = [];
        
        try {
          // Handle different interaction types
          if (interaction instanceof ChatInputCommandInteraction || 
              interaction instanceof MessageContextMenuCommandInteraction || 
              interaction instanceof UserContextMenuCommandInteraction) {
            if (interaction.options && interaction.options.data) {
              for (const option of interaction.options.data) {
                try {
                  if (option.type === ApplicationCommandOptionType.User && option.user) {
                    commandUsers.push(option.user);
                  }
                  
                  if (option.options) {
                    for (const subOption of option.options) {
                      if (subOption.type === ApplicationCommandOptionType.User && subOption.user) {
                        commandUsers.push(subOption.user);
                      }
                    }
                  }
                } catch (optionError) {
                  logger.error("Error processing command option:", optionError);
                }
              }
            }
          } else if (interaction instanceof ButtonInteraction) {
            // For duel button interactions
            try {
              if (interaction.customId.startsWith('duel_')) {
                const [_, creatorId] = interaction.customId.split('_');
                try {
                  const creator = await interaction.client.users.fetch(creatorId);
                  commandUsers.push(creator);
                } catch (fetchError) {
                  logger.error(`Failed to fetch user ${creatorId}:`, fetchError);
                }
              }
            } catch (buttonError) {
              logger.error("Error processing button interaction:", buttonError);
            }
          }
        } catch (interactionTypeError) {
          logger.error("Error determining interaction type:", interactionTypeError);
        }
  
        try {
          const hasBot = commandUsers.some(user => user?.bot);
          if (hasBot) {
            // Check if interaction can be replied to
            if (isRepliableInteraction(interaction)) {
              await interaction.reply({
                content: "⚠️ Ботов нельзя передавать!",
                ephemeral: true
              }).catch(replyError => {
                logger.error("Error replying to interaction:", replyError);
              });
            } else {
              logger.warn("Cannot reply to this interaction type when bot user detected");
            }
            return;
          }
        } catch (botCheckError) {
          logger.error("Error checking for bots:", botCheckError);
        }
  
        try {
          const users = [...commandUsers, interaction.user].filter(Boolean);
    
          const uniqueUsers = users
            .filter(user => !user?.bot)
            .filter((user, index, arr) => 
              arr.findIndex(u => u?.id === user?.id) === index
            );
    
          for (const user of uniqueUsers) {
            try {
              if (user && user.id) {
                await createUserIfNeeded(user.id);
              }
            } catch (createUserError) {
              logger.error(`Error creating user ${user?.id}:`, createUserError);
            }
          }
        } catch (userProcessingError) {
          logger.error("Error processing users:", userProcessingError);
        }
  
        try {
          if (AppDataSource.manager.queryRunner?.isTransactionActive) {
            await AppDataSource.manager.queryRunner?.commitTransaction();
          }
        } catch (transactionError) {
          logger.error("Error committing transaction:", transactionError);
        }
        
        await next();
      } catch (error) {
        logger.error("EnsureUserGuard error:", error);
        await next();  // Continue to next guard even if this one fails
      }
    };
}

// Helper function to check if an interaction can be replied to
function isRepliableInteraction(
  interaction: Interaction
): interaction is ChatInputCommandInteraction<CacheType> | 
                MessageContextMenuCommandInteraction<CacheType> |
                UserContextMenuCommandInteraction<CacheType> |
                ButtonInteraction<CacheType> {
  return interaction instanceof ChatInputCommandInteraction || 
         interaction instanceof MessageContextMenuCommandInteraction || 
         interaction instanceof UserContextMenuCommandInteraction || 
         interaction instanceof ButtonInteraction;
}

async function createUserIfNeeded(discordId: string): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  
  try {
    const existingUser = await userRepo.findOne({ 
      where: { discordId },
      relations: ["exp", "currency", "giftStats"]
    });

    if (existingUser) return;

    logger.info(`[EnsureUserGuard] Создаем нового пользователя ${discordId}`);

    const newUser = userRepo.create({
      discordId,
      messageCount: 0n,
      voiceMinutes: 0n
    });

    await userRepo.save(newUser);

    try {
      const exp = new Exp();
      exp.exp = 0n;
      exp.level = 1;
      exp.user = newUser;
      await AppDataSource.getRepository(Exp).save(exp);
    } catch (expError) {
      logger.error(`Error creating exp for user ${discordId}:`, expError);
    }

    try {
      const currency = new Currency();
      currency.currencyCount = 0n;
      currency.user = newUser;
      await AppDataSource.getRepository(Currency).save(currency);
    } catch (currencyError) {
      logger.error(`Error creating currency for user ${discordId}:`, currencyError);
    }

    try {
      const giftStats = new GiftStats();
      giftStats.discordId = discordId;
      giftStats.user = newUser;
      giftStats.trackedVoiceMinutes = 0n;
      giftStats.claimedGiftsFromVoice = 0;
      giftStats.totalGiftsClaimed = 0;
      giftStats.availableGifts = 0;
      await AppDataSource.getRepository(GiftStats).save(giftStats);
    } catch (giftStatsError) {
      logger.error(`Error creating giftStats for user ${discordId}:`, giftStatsError);
    }

    try {
      const checkUser = await userRepo.findOne({
        where: { discordId },
        relations: ["exp"]
      });
      
      if (!checkUser) {
        logger.error(`Не удалось создать пользователя ${discordId}`);
        return;  // Return without throwing to continue with next user
      }
      
      logger.info(`[EnsureUserGuard] Успешно создан пользователь ${discordId}`);
    } catch (checkError) {
      logger.error(`Error checking user creation ${discordId}:`, checkError);
    }
  } catch (error) {
    logger.error(`[EnsureUserGuard] Ошибка при создании пользователя ${discordId}:`, error);
    // Don't throw the error to avoid breaking the guard chain
  }
}