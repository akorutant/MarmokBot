import { Discord, On, ArgsOf } from "discordx";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Exp } from "../entities/Exp.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";

@Discord()
class GuildEnterListener {
  @On({ event: "guildMemberAdd" })
  async onGuildMemberAdd([member]: ArgsOf<"guildMemberAdd">) {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const expRepository = AppDataSource.getRepository(Exp);
      const currencyRepository = AppDataSource.getRepository(Currency);
      const existingUser = await userRepository.findOneBy({ discordId: member.id });
      
      if (!existingUser) {
        const newUser = userRepository.create({ 
          discordId: member.id, 
          messageCount: 0n,
          voiceMinutes: 0n
        });
        await userRepository.save(newUser);
        
        const newExp = expRepository.create({ 
          exp: 0n, 
          user: newUser 
        });
        await expRepository.save(newExp);

        const newCurrency = currencyRepository.create(
          {
            currencyCount: 0n,
            user: newUser
          }
        )
        await currencyRepository.save(newCurrency);

        logger.info("Создан новый пользователь: %s", member.id);
      }
    } catch (error) {
      logger.error("Ошибка при добавлении пользователя в БД: %o", error);
    }
  }
}

export default GuildEnterListener;
