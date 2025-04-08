import { Discord, On, ArgsOf } from "discordx";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import logger from "../services/logger.js";

@Discord()
class GuildEnterListener {
  @On({ event: "guildMemberAdd" })
  @EnsureUser() 
  async onGuildMemberAdd([member]: ArgsOf<"guildMemberAdd">) {
    logger.info("Пользователь добавлен/обновлен в БД: %s", member.id);
  }
}

export default GuildEnterListener;