import { dirname, importx } from "@discordx/importer";
import type { Interaction, Message } from "discord.js";
import { IntentsBitField } from "discord.js";
import { Client } from "discordx";
import { AppDataSource } from "./services/database.js";
import { setupLogServer } from "./services/logServer/logServer.js";
import { seedDefaultConfigs } from "./services/initDatabase.js";
import { setDiscordClient } from "./utils/decorators/CheckLevelUp.js";
import { setDiscordClient as setDiscordClientGifts } from "./utils/decorators/CheckGiftProgress.js";

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
    await seedDefaultConfigs();
    console.log("✅ Data Source has been initialized!");

  } catch (error) {
    console.error("💥 Database connection error:", error);
    process.exit(1);
  }

  setupLogServer();
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
  setDiscordClient(bot);
  setDiscordClientGifts(bot);
  console.log("🤖 Bot started");
});

bot.on("interactionCreate", (interaction: Interaction) => {
  bot.executeInteraction(interaction);
});

bot.on("messageCreate", (message: Message) => {
  void bot.executeCommand(message);
});

void run();
