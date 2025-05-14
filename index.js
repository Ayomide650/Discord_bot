// index.js
import express from 'express';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Express setup for Render (keep server alive)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User]
});

const CONFIG = {
  disallowedChannelIds: process.env.DISALLOWED_CHANNEL_IDS?.split(',') || [],
  linkRegex: /(https?:\/\/[^\s]+)/gi
};

const userCooldowns = new Map();

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`🛑 Link deletion active in channels: ${CONFIG.disallowedChannelIds.join(', ')}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // DM ping command
  if (message.channel.type === 1 && message.content === '!ping') {
    return message.reply('🏓 Pong!');
  }

  const now = Date.now();
  const cooldown = userCooldowns.get(message.author.id) || 0;
  if (now - cooldown < 1000) return; // 1 second cooldown
  userCooldowns.set(message.author.id, now);

  const isDisallowed = CONFIG.disallowedChannelIds.includes(message.channelId);
  if (isDisallowed && CONFIG.linkRegex.test(message.content)) {
    try {
      await message.delete();

      const warning = await message.channel.send({
        content: `${message.author}, links are not allowed here.`
      });

      setTimeout(() => {
        warning.delete().catch(() => {});
      }, 5000);

      console.log(`🧹 Deleted link from ${message.author.tag}`);
    } catch (err) {
      console.error('❌ Failed to delete message:', err);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

process.on('SIGINT', () => {
  console.log('🛑 Bot shutting down...');
  client.destroy();
  process.exit(0);
});
