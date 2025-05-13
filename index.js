import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

// Initialize the client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// Config
const CONFIG = {
  linkRegex: /(https?:\/\/[^\s]+)/gi,
  disallowedChannels: process.env.DISALLOWED_CHANNEL_IDS
    ? process.env.DISALLOWED_CHANNEL_IDS.split(',').map(id => id.trim())
    : [],
};

// Cooldown map to prevent rapid spam bypass
const cooldown = new Map();

client.once(Events.ClientReady, (c) => {
  console.log(`🟢 Logged in as ${c.user.tag}`);
  console.log(`🛑 Link deletion active in channels: ${CONFIG.disallowedChannels.join(', ') || 'None'}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const channelId = message.channelId;

  // Skip if the channel isn't in the disallowed list
  if (!CONFIG.disallowedChannels.includes(channelId)) return;

  // Check if message contains a link
  if (!CONFIG.linkRegex.test(message.content)) return;

  // Prevent user from bypassing with spam
  if (cooldown.has(userId)) return;

  try {
    await message.delete();

    const warning = await message.channel.send({
      content: `${message.author}, links are not allowed in this channel.`,
    });

    // Auto-delete warning after 5 seconds
    setTimeout(() => {
      warning.delete().catch(() => {});
    }, 5000);

    console.log(`❌ Deleted link from ${message.author.tag} in channel ${channelId}`);

    // Add user to cooldown
    cooldown.set(userId, true);
    setTimeout(() => cooldown.delete(userId), 3000); // 3 seconds
  } catch (err) {
    console.error('Error handling message:', err);
  }
});

// Handle bot login
client.login(process.env.DISCORD_TOKEN);

// Optional: clean shutdown
process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  client.destroy();
  process.exit(0);
});
