// index.js - Updated to handle edited messages and enforce link restrictions
const { Client, Events, GatewayIntentBits, Collection, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { keepAlive } = require('./server');

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Prevent multiple responses to the same message
const processedMessages = new Set();
// Clean up the Set every hour to prevent memory leaks
setInterval(() => {
  processedMessages.clear();
}, 3600000); // Clear every hour

// Link detection regex
const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

// Function to check if user is an admin
function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// Function to handle link restriction in messages
async function handleLinkRestriction(message) {
  // Check if disallowed channels are configured
  const disallowedChannels = config.DISALLOWED_CHANNEL_IDS || [];
  if (!Array.isArray(disallowedChannels) || disallowedChannels.length === 0) {
    return false; // No restrictions if no channels are configured
  }
  
  // Check if message is in a disallowed channel
  if (!disallowedChannels.includes(message.channelId)) {
    return false; // Not in a disallowed channel
  }
  
  // Reset regex lastIndex (important when using /g flag)
  linkRegex.lastIndex = 0;
  
  // Check if message contains links
  if (linkRegex.test(message.content)) {
    // Skip restriction for admins
    if (message.member && isAdmin(message.member)) {
      console.log(`👑 Admin ${message.author.tag} sent a link in #${message.channel.name} - allowed`);
      return false; // Admin is allowed to post links
    }
    
    try {
      // Delete the message with the link
      await message.delete();
      
      // Send a warning message that disappears after 5 seconds
      const warning = await message.channel.send({
        content: `${message.author}, links are not allowed in this channel.`
      });
      
      setTimeout(() => {
        warning.delete().catch(err => {
          if (err.code !== 10008) { // Unknown Message error
            console.error('Error deleting warning:', err);
          }
        });
      }, 5000);
      
      console.log(`🧹 Deleted link from ${message.author.tag} in #${message.channel.name}`);
      return true; // Link was found and handled
    } catch (error) {
      console.error('Error handling link restriction:', error);
      return false;
    }
  }
  
  return false; // No links found
}

// Command handling setup
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  
  // Log the active link restriction channels if configured
  const disallowedChannels = config.DISALLOWED_CHANNEL_IDS || [];
  if (Array.isArray(disallowedChannels) && disallowedChannels.length > 0) {
    console.log(`🛑 Link restriction active in channels: ${disallowedChannels.join(', ')}`);
  }
});

// Event handler for slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

// Handle new messages
client.on(Events.MessageCreate, async message => {
  // Check for links in restricted channels first
  const linkHandled = await handleLinkRestriction(message);
  if (linkHandled) return; // Stop if the message was handled by link restriction
  
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Check if message was already processed
  if (processedMessages.has(message.id)) return;
  
  // Check if the bot is mentioned or if the message is in the active channel
  const botMentioned = message.mentions.users.has(client.user.id);
  const isActiveChannel = message.channelId === config.ACTIVE_CHANNEL_ID;
  
  // Only respond if the bot is mentioned or the message is in the active channel
  if ((isActiveChannel || botMentioned) && message.content.trim() !== '') {
    try {
      // Mark message as processed immediately
      processedMessages.add(message.id);
      
      // Process the message - remove any mention of the bot
      const messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
      
      // Skip empty messages after removing mentions
      if (messageContent === '') return;
      
      // Set typing indicator to show the bot is working
      message.channel.sendTyping().catch(e => console.error("Could not send typing indicator:", e));
      
      // Import the bot's response handling from commands/bot.js
      const botCommand = require('./commands/bot');
      const response = await botCommand.generateResponse(messageContent);
      
      // Split long messages if needed (Discord has a 2000 character limit)
      if (response.length <= 2000) {
        await message.reply(response);
      } else {
        // Split into chunks of 2000 characters
        const chunks = response.match(/.{1,2000}/g) || [];
        let firstChunk = true;
        
        for (const chunk of chunks) {
          if (firstChunk) {
            await message.reply(chunk);
            firstChunk = false;
          } else {
            await message.channel.send(chunk);
          }
        }
      }
    } catch (error) {
      console.error('Error responding to message:', error);
      await message.reply('Sorry, I encountered an error while processing your message.');
    }
  }
});

// Handle edited messages - check for links
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  // Ignore bots
  if (newMessage.author?.bot) return;
  
  // Check if the message was edited to include links
  await handleLinkRestriction(newMessage);
});

// Start the keep-alive server for hosting on Render
keepAlive();

// Log in to Discord with your client's token
client.login(config.BOT_TOKEN);
