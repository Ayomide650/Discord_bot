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

function isBotAdmin(userId) {
  const botAdmins = (process.env.BOT_ADMIN || '').split(',').map(id => id.trim());
  return botAdmins.includes(userId);
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

async function handleCheckCommand(message) {
  // Check if user is a bot admin
  if (!isBotAdmin(message.author.id)) {
    const reply = await message.reply('You do not have permission to use this command.');
    // Delete the reply after 5 seconds
    setTimeout(() => {
      reply.delete().catch(err => {
        if (err.code !== 10008) {
          console.error('Error deleting permission warning:', err);
        }
      });
    }, 5000);
    return;
  }
  
  // Parse the number from the command
  const args = message.content.split(' ');
  const numberOfMessages = parseInt(args[1]);
  
  if (isNaN(numberOfMessages) || numberOfMessages < 1 || numberOfMessages > 100) {
    const reply = await message.reply('Please provide a valid number between 1 and 100. Example: `.check 50`');
    setTimeout(() => {
      reply.delete().catch(err => {
        if (err.code !== 10008) {
          console.error('Error deleting usage warning:', err);
        }
      });
    }, 5000);
    return;
  }
  
  try {
    // Delete the command message
    await message.delete();
    
    // Send processing message
    const processingMsg = await message.channel.send('🔍 Checking messages for links...');
    
    // Fetch messages from the channel
    const messages = await message.channel.messages.fetch({ limit: numberOfMessages });
    
    let deletedCount = 0;
    const messagesToDelete = [];
    
    // Check each message for links
    for (const [messageId, msg] of messages) {
      // Skip bot messages
      if (msg.author.bot) continue;
      
      // Reset regex index for fresh test
      linkRegex.lastIndex = 0;
      
      if (linkRegex.test(msg.content)) {
        // Don't delete links from admins
        if (msg.member && isAdmin(msg.member)) {
          console.log(`👑 Skipping admin link from ${msg.author.tag}`);
          continue;
        }
        
        messagesToDelete.push(msg);
      }
    }
    
    // Delete messages with links (with small delay to avoid rate limits)
    for (const msg of messagesToDelete) {
      try {
        await msg.delete();
        deletedCount++;
        console.log(`🧹 Deleted link from ${msg.author.tag} during cleanup`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error deleting message from ${msg.author.tag}:`, error);
      }
    }
    
    // Delete processing message
    await processingMsg.delete();
    
    // Send completion message
    const completionMessage = deletedCount > 0 
      ? `Deleted all links, please do not send links here again. Action performed by ${message.author.displayName}`
      : `No links found in the last ${numberOfMessages} messages.`;
    
    await message.channel.send(completionMessage);
    
    console.log(`✅ Cleanup complete. Deleted ${deletedCount} messages with links.`);
    
  } catch (error) {
    console.error('Error during link cleanup:', error);
    await message.channel.send('An error occurred while checking messages.');
  }
}

client.once(Events.ClientReady, c => {
  console.log(`✅ Ready! Logged in as ${c.user.tag}`);
  
  const disallowedChannels = (process.env.DISALLOWED_CHANNEL_IDS || '').split(',').map(id => id.trim());
  if (disallowedChannels.length > 0 && disallowedChannels[0] !== '') {
    console.log(`🛑 Link restriction active in channels: ${disallowedChannels.join(', ')}`);
  } else {
    console.log(`ℹ️ No link restrictions configured`);
  }
  
  const botAdmins = (process.env.BOT_ADMIN || '').split(',').map(id => id.trim());
  if (botAdmins.length > 0 && botAdmins[0] !== '') {
    console.log(`👑 Bot admins configured: ${botAdmins.join(', ')}`);
  }
});

client.on(Events.MessageCreate, async message => {
  // Skip bot messages
  if (message.author.bot) return;
  
  // Handle .check command
  if (message.content.startsWith('.check')) {
    await handleCheckCommand(message);
    return;
  }
  
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
