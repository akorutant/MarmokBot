import { Discord, On, ArgsOf } from "discordx";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";

@Discord()
class GuildEnterListener {
  @On({ event: "guildMemberAdd" })
  async onGuildMemberAdd([member]: ArgsOf<"guildMemberAdd">) {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const existingUser = await userRepository.findOneBy({ discordId: member.id });
      if (!existingUser) {
        const newUser = userRepository.create({ 
          discordId: member.id, 
          exp: 0n, 
          voiceMinutes: 0 
        });
        await userRepository.save(newUser);
      }
    } catch (error) {
      console.error("Ошибка при добавлении пользователя в БД:", error);
    }
  }
}

export default GuildEnterListener;
