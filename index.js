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

const processedMessages = new Set();
setInterval(() => processedMessages.clear(), 3600000); // Clean every hour

const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

async function handleLinkRestriction(message) {
  const disallowedChannels = (process.env.DISALLOWED_CHANNEL_IDS || '').split(',').map(id => id.trim());

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
          if (err.code !== 10008) console.error('Error deleting warning:', err);
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
  if (disallowedChannels.length > 0) {
    console.log(`🛑 Link restriction active in channels: ${disallowedChannels.join(', ')}`);
  }
});

client.on(Events.MessageCreate, async message => {
  const linkHandled = await handleLinkRestriction(message);
  if (linkHandled) return;

  if (message.author.bot) return;
  if (processedMessages.has(message.id)) return;

  const botMentioned = message.mentions.users.has(client.user.id);
  const isActiveChannel = message.channelId === process.env.ACTIVE_CHANNEL_ID;

  if ((isActiveChannel || botMentioned) && message.content.trim() !== '') {
    try {
      processedMessages.add(message.id);
      const messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
      if (messageContent === '') return;

      message.channel.sendTyping().catch(e => console.error("Could not send typing indicator:", e));

      // Simple bot echo response — replace with your logic
      const response = `You said: "${messageContent}"`;

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
client.login(process.env.BOT_TOKEN);
