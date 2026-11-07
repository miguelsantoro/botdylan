import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { handle } from "./bot/commands.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  handle(message).catch(() => console.error("Could not process the Discord command."));
});

client.login(process.env.DISCORD_TOKEN);
