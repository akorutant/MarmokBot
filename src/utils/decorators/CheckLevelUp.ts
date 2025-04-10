import { AppDataSource } from "../../services/database.js";
import { Exp } from "../../entities/Exp.js";
import logger from "../../services/logger.js";
import { Client } from "discord.js";
import { getMaxLevelForExp, getExpForLevel } from "../levelUpUtils.js";

let _discordClient: Client | null = null;

/**
 * Устанавливает глобальный экземпляр клиента Discord для использования в декораторах
 * @param client экземпляр клиента Discord
 */
export function setDiscordClient(client: Client): void {
    _discordClient = client;
    logger.info("Discord клиент установлен для декораторов");
}

interface HasDiscordClient {
    client?: Client;
}

export function CheckLevelUp() {
    return function(
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(this: HasDiscordClient, ...args: any[]) {
            const result = await originalMethod.apply(this, args);

            try {
                let userId: string;
                
                if (propertyKey === "onMessage" && args[0] && args[0][0] && args[0][0].author) {
                    userId = args[0][0].author.id;
                } else if (propertyKey === "onVoiceStateUpdate" && args[0] && args[0][1] && args[0][1].id) {
                    userId = args[0][1].id;
                } else if (propertyKey === "updateActiveVoiceSessions" && typeof args[0] === "string") {
                    userId = args[0];
                } else {
                    return result;
                }

                const expRepository = AppDataSource.getRepository(Exp);
                
                const expRecord = await expRepository.findOne({
                    where: { user: { discordId: userId } },
                    relations: ["user"]
                });

                if (!expRecord || expRecord.level >= 25) {
                    return result;
                }

                const currentLevel = expRecord.level;
                const maxLevel = getMaxLevelForExp(expRecord.exp, currentLevel);
                
                if (maxLevel > currentLevel) {
                    expRecord.level = maxLevel;
                    await expRepository.save(expRecord);

                    logger.info(
                        `Пользователь ${userId} повысил уровень до ${maxLevel}. ` +
                        `Текущий опыт: ${expRecord.exp}, Требовалось: ${getExpForLevel(maxLevel)}`
                    );

                    try {
                        const client = this.client || _discordClient;
                        
                        if (client && client.users) {
                            const user = await client.users.fetch(userId);
                            if (user) {
                                await user.send(`Поздравляем! Вы достигли ${maxLevel} уровня на сервере!`);
                            }
                        } else {
                            logger.warn(`Discord клиент недоступен для отправки уведомления пользователю ${userId}`);
                        }
                    } catch (notifyError) {
                        logger.warn(
                            `Не удалось отправить уведомление пользователю ${userId} о повышении уровня: %O`,
                            notifyError
                        );
                    }
                }
            } catch (error) {
                logger.error("Ошибка в декораторе CheckLevelUp: %O", error);
            }

            return result;
        };

        return descriptor;
    };
}