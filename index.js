import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel]
});

const CONFIG = {
  disallowedChannelIds: process.env.DISALLOWED_CHANNEL_IDS?.split(',') || [],
  linkRegex: /(https?:\/\/[^\s]+)/gi
};

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`🛑 Link deletion active in channels: ${CONFIG.disallowedChannelIds.join(', ')}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Check if the message is in a disallowed channel
  if (CONFIG.disallowedChannelIds.includes(message.channelId)) {
    if (CONFIG.linkRegex.test(message.content)) {
      try {
        await message.delete();
        const warning = await message.channel.send(`${message.author}, links are not allowed here.`);
        setTimeout(() => warning.delete().catch(() => {}), 5000);
        console.log(`🛑 Deleted link from ${message.author.tag} in #${message.channel.name}`);
      } catch (err) {
        console.error('❌ Failed to delete message:', err);
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

process.on('SIGINT', () => {
  console.log('👋 Bot shutting down...');
  client.destroy();
  process.exit(0);
});
