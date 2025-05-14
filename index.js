// index.js
import express from 'express';
import { Client, GatewayIntentBits, Partials, Events, PermissionFlagsBits } from 'discord.js';
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
  // We'll create a function to get a fresh regex each time to avoid the 'g' flag issue
  getLinkRegex: () => /(https?:\/\/[^\s]+)/gi
};

// Track cooldowns per channel+user instead of just per user
// This prevents the cooldown from being global across all channels
const userChannelCooldowns = new Map();

// Function to check if user is an admin
function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

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

  // Check if this is a disallowed channel
  const isDisallowed = CONFIG.disallowedChannelIds.includes(message.channelId);
  if (!isDisallowed) return;

  // Get a fresh regex for each message to avoid the lastIndex issue with 'g' flag
  const linkRegex = CONFIG.getLinkRegex();
  
  // Check if message contains links
  if (linkRegex.test(message.content)) {
    // Skip restriction for admins
    if (message.member && isAdmin(message.member)) {
      console.log(`👑 Admin ${message.author.tag} sent a link in ${message.channel.name} - allowed`);
      return;
    }

    // Create a unique key for each user+channel combination for cooldown
    const cooldownKey = `${message.channelId}-${message.author.id}`;
    
    // Check if user+channel is on cooldown
    const now = Date.now();
    const cooldown = userChannelCooldowns.get(cooldownKey) || 0;
    
    // If on cooldown, just delete without warning
    if (now - cooldown < 5000) {
      try {
        await message.delete();
        console.log(`🧹 Deleted link from ${message.author.tag} in ${message.channel.name} (no warning, on cooldown)`);
      } catch (deleteErr) {
        if (deleteErr.code !== 10008) {
          console.error('❌ Failed to delete message:', deleteErr.message);
        }
      }
      return; // Exit early - no warning needed
    }
    
    // Not on cooldown - delete and show warning
    try {
      // Set cooldown first to prevent race conditions
      userChannelCooldowns.set(cooldownKey, now);
      
      try {
        await message.delete();
        console.log(`🧹 Deleted link from ${message.author.tag} in ${message.channel.name}`);
      } catch (deleteErr) {
        if (deleteErr.code === 10008) {
          console.log(`⚠️ Message was already deleted in ${message.channel.name}`);
        } else {
          console.error('❌ Failed to delete message:', deleteErr.message);
        }
      }
      
      try {
        const warning = await message.channel.send({
          content: `No links allowed in this channel,thanks for understanding.`
        });
        
        setTimeout(() => {
          warning.delete().catch((warnDeleteErr) => {
            if (warnDeleteErr.code !== 10008) {
              console.error('⚠️ Could not delete warning message:', warnDeleteErr.message);
            }
          });
        }, 5000);
      } catch (warnErr) {
        console.error('❌ Failed to send warning:', warnErr.message);
      }
    } catch (err) {
      console.error('❌ Unexpected error in message processing:', err);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

process.on('SIGINT', () => {
  console.log('🛑 Bot shutting down...');
  client.destroy();
  process.exit(0);
});
