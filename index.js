import { Client, Events, GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder, REST, Routes } from 'discord.js';
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

// Slash command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check and delete links from recent messages')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('Number of messages to check')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),
];

// Register slash commands
async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

client.once(Events.ClientReady, async c => {
  console.log(`✅ Ready! Logged in as ${c.user.tag}`);
  
  // Register slash commands
  await registerCommands();
  
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
  
  // Handle link restriction
  await handleLinkRestriction(message);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  // Skip bot messages
  if (newMessage.author?.bot) return;
  
  // Handle link restriction on edited messages
  await handleLinkRestriction(newMessage);
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  if (interaction.commandName === 'check') {
    // Check if user is a bot admin
    if (!isBotAdmin(interaction.user.id)) {
      await interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true
      });
      return;
    }
    
    const numberOfMessages = interaction.options.getInteger('number');
    
    await interaction.deferReply();
    
    try {
      // Fetch messages from the channel
      const messages = await interaction.channel.messages.fetch({ limit: numberOfMessages });
      
      let deletedCount = 0;
      const messagesToDelete = [];
      
      // Check each message for links
      for (const [messageId, message] of messages) {
        // Skip bot messages
        if (message.author.bot) continue;
        
        // Reset regex index for fresh test
        linkRegex.lastIndex = 0;
        
        if (linkRegex.test(message.content)) {
          // Don't delete links from admins
          if (message.member && isAdmin(message.member)) {
            console.log(`👑 Skipping admin link from ${message.author.tag}`);
            continue;
          }
          
          messagesToDelete.push(message);
        }
      }
      
      // Delete messages with links (with small delay to avoid rate limits)
      for (const message of messagesToDelete) {
        try {
          await message.delete();
          deletedCount++;
          console.log(`🧹 Deleted link from ${message.author.tag} during cleanup`);
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error deleting message from ${message.author.tag}:`, error);
        }
      }
      
      // Send completion message
      const completionMessage = deletedCount > 0 
        ? `Deleted all links, please do not send links here again. Action performed by ${interaction.user.displayName}`
        : `No links found in the last ${numberOfMessages} messages.`;
      
      await interaction.editReply({
        content: completionMessage
      });
      
      console.log(`✅ Cleanup complete. Deleted ${deletedCount} messages with links.`);
      
    } catch (error) {
      console.error('Error during link cleanup:', error);
      await interaction.editReply({
        content: 'An error occurred while checking messages.'
      });
    }
  }
});

// Keep the server alive (for hosting platforms like Replit)
keepAlive();

// Login to Discord
client.login(process.env.BOT_TOKEN);
