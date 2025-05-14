import { Client, Events, GatewayIntentBits, Collection, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { keepAlive } from './server.js';

// Emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const processedMessages = new Set();
setInterval(() => {
  processedMessages.clear();
}, 3600000); // Clear every hour

const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

async function handleLinkRestriction(message) {
  const disallowedChannels = config.DISALLOWED_CHANNEL_IDS || [];
  if (!Array.isArray(disallowedChannels) || disallowedChannels.length === 0) return false;
  if (!disallowedChannels.includes(message.channelId)) return false;

  linkRegex.lastIndex = 0;

  if (linkRegex.test(message.content)) {
    if (message.member && isAdmin(message.member)) {
      console.log(`👑 Admin ${message.author.tag} sent a link in #${message.channel.name} - allowed`);
      return false;
    }

    try {
      await message.delete();
      const warning = await message.channel.send({
        content: `${message.author}, links are not allowed in this channel.`
      });

      setTimeout(() => {
        warning.delete().catch(err => {
          if (err.code !== 10008) {
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

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(`./commands/${file}`);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

client.once(Events.ClientReady, c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  const disallowedChannels = config.DISALLOWED_CHANNEL_IDS || [];
  if (Array.isArray(disallowedChannels) && disallowedChannels.length > 0) {
    console.log(`🛑 Link restriction active in channels: ${disallowedChannels.join(', ')}`);
  }
});

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
    const msg = { content: 'There was an error while executing this command!', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

client.on(Events.MessageCreate, async message => {
  const linkHandled = await handleLinkRestriction(message);
  if (linkHandled) return;
  if (message.author.bot) return;
  if (processedMessages.has(message.id)) return;

  const botMentioned = message.mentions.users.has(client.user.id);
  const isActiveChannel = message.channelId === config.ACTIVE_CHANNEL_ID;

  if ((isActiveChannel || botMentioned) && message.content.trim() !== '') {
    try {
      processedMessages.add(message.id);
      const messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
      if (messageContent === '') return;

      message.channel.sendTyping().catch(e => console.error("Could not send typing indicator:", e));

      const botCommand = await import('./commands/bot.js');
      const response = await botCommand.generateResponse(messageContent);

      if (response.length <= 2000) {
        await message.reply(response);
      } else {
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

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  await handleLinkRestriction(newMessage);
});

keepAlive();
client.login(config.BOT_TOKEN);
