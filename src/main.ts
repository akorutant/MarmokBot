// Обновления в main.ts для полной интеграции системы магазина ролей

import { dirname, importx } from "@discordx/importer";
import type { Interaction, Message } from "discord.js";
import { IntentsBitField } from "discord.js";
import { Client } from "discordx";
import { AppDataSource } from "./services/database.js";
import { seedDefaultConfigs, seedRoleConfigs } from "./services/initDatabase.js";
import { setDiscordClient } from "./utils/decorators/CheckLevelUp.js";
import { setDiscordClient as setDiscordClientGifts } from "./utils/decorators/CheckGiftProgress.js";
import { RoleMaintenanceScheduler } from "./services/RoleMaintenanceScheduler.js";
import { RoleShopService } from "./services/RoleShopService.js";
import { RoleApprovalService } from "./services/RoleApprovalService.js";

export const bot = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.MessageContent,
  ],
  silent: false,
  simpleCommand: {
    prefix: "!",
  },
});

async function run() {
  try {
    await AppDataSource.initialize();
    console.log("✅ Database connected!");
    
    // Инициализируем все конфигурации
    await seedDefaultConfigs();
    await seedRoleConfigs();
    console.log("✅ All configurations initialized!");
    
  } catch (error) {
    console.error("💥 Database connection error:", error);
    process.exit(1);
  }

  try {
    console.log("📦 Импорт команд...");
    await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);
    console.log("✅ Импорт завершен");
  } catch (err) {
    console.error("❌ Ошибка при импорте файлов:", err);
    process.exit(1);
  }
  
  if (!process.env.BOT_TOKEN) {
    throw Error("Could not find BOT_TOKEN in your environment");
  }

  await bot.login(process.env.BOT_TOKEN);
}

bot.once("ready", async () => {
  await bot.initApplicationCommands();
  
  // Инициализируем Discord клиенты для декораторов
  setDiscordClient(bot);
  setDiscordClientGifts(bot);

  // Инициализируем планировщик обслуживания ролей
  const roleScheduler = RoleMaintenanceScheduler.getInstance(bot);
  roleScheduler.start();
  console.log("✅ Role maintenance scheduler started");

  // Инициализируем сервисы
  const roleShopService = RoleShopService.getInstance();
  const roleApprovalService = RoleApprovalService.getInstance();
  console.log("✅ Role services initialized");

  bot.user?.setActivity({
    name: "мурчание Kitsune",
    type: 2 
  });

  console.log("🤖 Bot started with role shop system");
});

bot.on("interactionCreate", (interaction: Interaction) => {
  bot.executeInteraction(interaction);
});

bot.on("messageCreate", (message: Message) => {
  void bot.executeCommand(message);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Останавливаем планировщик ролей
    const roleScheduler = RoleMaintenanceScheduler.getInstance(bot);
    roleScheduler.stop();
    
    // Закрываем соединение с базой данных
    await AppDataSource.destroy();
    
    // Закрываем Discord клиент
    bot.destroy();
    
    console.log("✅ Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

void run();