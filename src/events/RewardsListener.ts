import { Discord, On, ArgsOf, Client } from "discordx";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Exp } from "../entities/Exp.js";
import { Currency } from "../entities/Currency.js";
import { GiftStats } from "../entities/GiftStats.js";
import { TextChannel, EmbedBuilder } from "discord.js";
import logger from "../services/logger.js";
import { BlockVoicePresentInChannels } from "../utils/decorators/BlockVoicePresentInChannels.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { CheckLevelUp, setDiscordClient as setLevelUpClient } from "../utils/decorators/CheckLevelUp.js";
import { RARITY_COLORS } from "../constants/colors.js";
import { CheckGiftProgress, setDiscordClient as setGiftClient, checkAndProcessGifts, sendGiftNotification } from "../utils/decorators/CheckGiftProgress.js";

const activeVoiceIntervals = new Map<string, NodeJS.Timeout>();
let discordClient: Client;

@Discord()
export default class RewardsListener {
  constructor(private client: Client) {
    setLevelUpClient(client);
    setGiftClient(client);
    discordClient = client;
    logger.info("RewardsListener initialized");
  }
  
  @On({ event: "messageCreate" })
  @EnsureUser()
  @CheckLevelUp()
  @CheckGiftProgress()
  async onMessage([message]: ArgsOf<"messageCreate">) {
    if (message.author.bot) return;
    const userRepository = AppDataSource.getRepository(User);
    const expRepository = AppDataSource.getRepository(Exp);
    const currencyRepository = AppDataSource.getRepository(Currency);

    await userRepository.increment({ discordId: message.author.id }, "messageCount", 1);
    await expRepository.increment({ id: (await userRepository.findOneOrFail({ where: { discordId: message.author.id }, relations: ["exp"] })).exp.id }, "exp", 1);
    await currencyRepository.increment({ id: (await userRepository.findOneOrFail({ where: { discordId: message.author.id }, relations: ["currency"] })).currency.id }, "currencyCount", 1);

    logger.info(`Message processed for ${message.author.id}`);
  }

  @On({ event: "voiceStateUpdate" })
  @BlockVoicePresentInChannels()
  @EnsureUser()
  @CheckLevelUp()
  @CheckGiftProgress()
  async onVoiceStateUpdate([oldState, newState]: ArgsOf<"voiceStateUpdate">) {
    const userId = newState.id;
  
    const joined = !oldState.channel && newState.channel;
    const left = oldState.channel && !newState.channel;
  
    const userRepo = AppDataSource.getRepository(User);
    const expRepo = AppDataSource.getRepository(Exp);
    const currencyRepo = AppDataSource.getRepository(Currency);
  
    if (joined) {
      const interval = setInterval(async () => {
        try {
          const user = await userRepo.findOneOrFail({
            where: { discordId: userId },
            relations: ["exp", "currency"],
          });
  
          await userRepo.increment({ discordId: userId }, "voiceMinutes", 1);
          await expRepo.increment({ id: user.exp.id }, "exp", 5);
          await currencyRepo.increment({ id: user.currency.id }, "currencyCount", 1);
          
          const giftResult = await checkAndProcessGifts(userId);
          
          if (giftResult && giftResult.newGifts > 0) {
            await sendGiftNotification(userId, giftResult.newGifts, giftResult.totalAvailable);
          }
          
          logger.info(`+1 минута голосового: ${userId}`);
        } catch (err) {
          logger.error(`Voice interval error for ${userId}: ${err}`);
        }
      }, 60 * 1000); 
  
      activeVoiceIntervals.set(userId, interval);
      logger.info(`Voice timer started for ${userId}`);
    }
  
    if (left) {
      const interval = activeVoiceIntervals.get(userId);
      if (interval) {
        clearInterval(interval);
        activeVoiceIntervals.delete(userId);
        logger.info(`Voice timer cleared for ${userId}`);
      }
  
      try {
        const giftResult = await checkAndProcessGifts(userId, true);
        
        if (giftResult && giftResult.newGifts > 0) {
          await sendGiftNotification(userId, giftResult.newGifts, giftResult.totalAvailable);
          logger.info(`Gifts finalized after voice exit: ${userId} +${giftResult.newGifts}`);
        } else {
          logger.debug(`No new gifts after voice exit for ${userId}`);
        }
      } catch (err) {
        logger.error(`Error finalizing voice exit for ${userId}: ${err}`);
      }
    }
  }
}