import { Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { keepAlive } from './server.js';

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

async function handleLinkRestriction(message) {
  const disallowedChannels = (process.env.DISALLOWED_CHANNEL_IDS || '').split(',').map(id => id.trim());
  
  // If no disallowed channels are configured, do nothing
  if (disallowedChannels.length === 0 || disallowedChannels[0] === '') return false;
  
  // Only check messages in disallowed channels
  if (!disallowedChannels.includes(message.channelId)) return false;

  // Reset regex index for fresh test
  linkRegex.lastIndex = 0;
  
  if (linkRegex.test(message.content)) {
    // Allow admins to post links
    if (message.member && isAdmin(message.member)) {
      console.log(`👑 Admin ${message.author.tag} sent a link in #${message.channel.name} - allowed`);
      return false;
    }

    try {
      // Delete the message with the link
      await message.delete();
      
      // Send warning message
      const warning = await message.channel.send({
        content: `${message.author}, links are not allowed in this channel.`
      });

      // Delete warning after 5 seconds
      setTimeout(() => {
        warning.delete().catch(err => {
          if (err.code !== 10008) { // Ignore "Unknown Message" error
            console.error('Error deleting warning:', err);
          }
        });
      }, 5000);

      console.log(`🧹 Deleted link from ${message.author.tag} in #${message.channel.name}`);
      return true;
    } catch (error) {
      console.error('Error handling link restriction:', error);
      return false;
    }
  }
  
  return false;
}

client.once(Events.ClientReady, c => {
  console.log(`✅ Ready! Logged in as ${c.user.tag}`);
  
  const disallowedChannels = (process.env.DISALLOWED_CHANNEL_IDS || '').split(',').map(id => id.trim());
  if (disallowedChannels.length > 0 && disallowedChannels[0] !== '') {
    console.log(`🛑 Link restriction active in channels: ${disallowedChannels.join(', ')}`);
  } else {
    console.log(`ℹ️ No link restrictions configured`);
  }
});

client.on(Events.MessageCreate, async message => {
  // Skip bot messages
  if (message.author.bot) return;
  
  // Handle link restriction
  await handleLinkRestriction(message);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  // Skip bot messages
  if (newMessage.author?.bot) return;
  
  // Handle link restriction on edited messages
  await handleLinkRestriction(newMessage);
});

// Keep the server alive (for hosting platforms like Replit)
keepAlive();

// Login to Discord
client.login(process.env.BOT_TOKEN);
