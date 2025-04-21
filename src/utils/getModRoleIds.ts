import { AppDataSource } from "../services/database.js";
import { Config } from "../entities/Config.js";
import { In } from "typeorm";

/**
 * Возвращает массив ID ролей по ключам из config (например, "high_mod_level", "medium_mod_level")
 */
export async function getModRoleIds(keys: string[]): Promise<string[]> {
  const configRepository = AppDataSource.getRepository(Config);

  const configs = await configRepository.find({
    where: {
      key: In(keys), 
    },
  });

  return configs
    .map(config => config.value)
    .filter(value => typeof value === "string" && /^\d{17,19}$/.test(value));
}
