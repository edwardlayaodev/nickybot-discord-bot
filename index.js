// IMPORTS
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { OpenAI } = require('openai');

const openai = new OpenAI();

// Prepare Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           
        GatewayIntentBits.GuildMessages,    
        GatewayIntentBits.MessageContent,   
        GatewayIntentBits.GuildMessageReactions,
    ],
});

client.once(Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.commands = new Collection(); 

// COMMANDS
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return; 
    console.log(interaction);
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
            await interaction.followUp({
                content: 'There was an error while executing this command!',
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.reply({
                content: 'There was an error while executing this command!',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
});

// EVENT LISTENERS
client.on(Events.MessageCreate, async (message) => {
    // Ignore normal bot messages or messages that don't mention our bot
    if (message.author.bot || !message.mentions.has(client.user)) return;
    const cleanPrompt = message.content.replace(/<@!?\d+>/g, '').trim();

    if (!cleanPrompt) return message.reply("Yes? How can I help you?");

    try {
        await message.channel.sendTyping();

        //Rolling messages, get the last 10 messages
        let prevMessages = await message.channel.messages.fetch({ limit: 10 });
        prevMessages = prevMessages.reverse(); 

        // Build conversation context
        const conversationLog = [
            { role: 'system', content: 'You are a discord bot assistant. Pattern the way you speak similar to the twitch streamer Emiru.' }
        ];

        prevMessages.forEach((msg) => {
            if (!msg.content || (msg.author.bot && msg.author.id !== client.user.id)) return;

            const cleanContent = msg.content.replace(/<@!?\d+>/g, '').trim();
            if (!cleanContent) return;

            const role = msg.author.id === client.user.id ? 'assistant' : 'user';

            conversationLog.push({
                role: role,
                content: cleanContent
            });
        });

        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo', 
            messages: conversationLog,
        });

        await message.reply(response.choices[0].message.content);
    } catch (error) {
        console.error("OpenAI Mention Error:", error);

        // Extract error details from OpenAI response
        let errorMsg = "I'm having trouble connecting to OpenAI right now.";
        if (error.error) {
            const apiError = error.error;
            errorMsg = `**OpenAI Error:** ${apiError.message || 'Unknown error'}`;
            if (apiError.type) {
                errorMsg += `\n**Type:** ${apiError.type}`;
            }
            if (apiError.code) {
                errorMsg += `\n**Code:** ${apiError.code}`;
            }
        } else if (error.message) {
            errorMsg = `**Error:** ${error.message}`;
        }

        message.reply(errorMsg);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.emoji.name === '🇺🇸') {
        const message = reaction.message;
        if (!message.content) return;

        try {
            const statusMsg = await message.reply("Translating to English... 🇺🇸");

            const response = await openai.chat.completions.create({
                model: 'gpt-4.1-mini', 
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a translator. Translate the text to English accurately. Provide ONLY the translation.' 
                    },
                    { 
                        role: 'user', 
                        content: message.content
                    }
                ],
            });

            await statusMsg.edit(`**English:** ${response.choices[0].message.content}`);

        } catch (error) {
            console.error("Error connecting to OpenAI:", error);

            // Extract error details from OpenAI response
            let errorMsg = "Couldn't reach OpenAI for the translation.";
            if (error.error) {
                const apiError = error.error;
                errorMsg = `**OpenAI Error:** ${apiError.message || 'Unknown error'}`;
                if (apiError.type) {
                    errorMsg += `\n**Type:** ${apiError.type}`;
                }
                if (apiError.code) {
                    errorMsg += `\n**Code:** ${apiError.code}`;
                }
            } else if (error.message) {
                errorMsg = `**Error:** ${error.message}`;
            }

            await statusMsg.edit(errorMsg);
        }
    }
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);