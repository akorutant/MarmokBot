import { Discord, On, ArgsOf } from "discordx";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { VoiceState } from "discord.js";

const activeVoiceSessions = new Map<string, number>();

@Discord()
class ExpListener {
  @On({ event: "messageCreate" })
  async onMessage([message]: ArgsOf<"messageCreate">) {
    if (message.author.bot) return;
    try {
      const userRepository = AppDataSource.getRepository(User);
      let user = await userRepository.findOneBy({ discordId: message.author.id });
      if (user) {
        await userRepository.increment({ discordId: message.author.id }, "exp", 1);
      } else {
        user = userRepository.create({ discordId: message.author.id, exp: 1n, voiceMinutes: 0 });
        await userRepository.save(user);
      }
    } catch (error) {
      console.error("Ошибка при обновлении exp пользователя:", error);
    }
  }

  @On({ event: "voiceStateUpdate" })
  async onVoiceStateUpdate([oldState, newState]: ArgsOf<"voiceStateUpdate">) {
    const userId = newState.id;
    const userRepository = AppDataSource.getRepository(User);

    if (!oldState.channel && newState.channel) {
      activeVoiceSessions.set(userId, Date.now());
    }
    else if (oldState.channel && !newState.channel) {
      const joinTime = activeVoiceSessions.get(userId);
      if (joinTime) {
        const diff = Date.now() - joinTime;
        const minutes = Math.floor(diff / (60 * 1000));
        if (minutes > 0) {
          const expToAdd = minutes * 5;
          try {
            let user = await userRepository.findOneBy({ discordId: userId });
            if (user) {
              await userRepository.increment({ discordId: userId }, "exp", expToAdd);
              await userRepository.increment({ discordId: userId }, "voiceMinutes", minutes);
            } else {
              user = userRepository.create({
                discordId: userId,
                exp: BigInt(expToAdd),
                voiceMinutes: minutes
              });
              await userRepository.save(user);
            }
          } catch (error) {
            console.error(`Ошибка при обновлении голосовых данных для ${userId}:`, error);
          }
        }
        activeVoiceSessions.delete(userId);
      }
    }
  }
}

setInterval(async () => {
  const userRepository = AppDataSource.getRepository(User);
  const now = Date.now();
  for (const [userId, joinTime] of activeVoiceSessions.entries()) {
    const diff = now - joinTime;
    if (diff >= 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      const expToAdd = minutes * 5;
      try {
        let user = await userRepository.findOneBy({ discordId: userId });
        if (user) {
          await userRepository.increment({ discordId: userId }, "exp", expToAdd);
          await userRepository.increment({ discordId: userId }, "voiceMinutes", minutes);
        } else {
          user = userRepository.create({
            discordId: userId,
            exp: BigInt(expToAdd),
            voiceMinutes: minutes
          });
          await userRepository.save(user);
        }
        activeVoiceSessions.set(userId, joinTime + minutes * 60 * 1000);
      } catch (error) {
        console.error(`Ошибка при периодическом обновлении для ${userId}:`, error);
      }
    }
  }
}, 60 * 1000);

export default ExpListener;
