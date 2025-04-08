import { AppDataSource } from "../../services/database.js";
import { Config } from "../../entities/Config.js";
import logger from "../../services/logger.js";

export function BlockVoicePresentInChannels() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const [oldState, newState] = args[0];
      
      const newChannelId = newState?.channelId;
      const oldChannelId = oldState?.channelId;

      if (!newChannelId && !oldChannelId) {
        return;
      }

      try {
        const configRepo = AppDataSource.getRepository(Config);
        const ignoredConfigs = await configRepo.find({
          where: { key: "ignore_voice_channel_exp" },
        });
        
        const ignoredIds = ignoredConfigs.map(config => config.value.trim());
        
        logger.info(`Ignored channel IDs: ${JSON.stringify(ignoredIds)}`);
        
        if (newChannelId && ignoredIds.includes(newChannelId)) {
          logger.info(`Канал ${newChannelId} в списке игнорируемых. EXP и валюта начисляться не будут.`);
          return; 
        }
        
        return originalMethod.apply(this, args);
      } catch (error) {
        logger.error("Ошибка при проверке конфигурации ignore_voice_channel_exp: %O", error);
        return;
      }
    };

    return descriptor;
  };
}