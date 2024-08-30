// register_commands.js
require('dotenv').config();
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const setupRegisterCommands = (client, db, config) => {
    const commands = [
        {
            name: 'vckick',
            description: 'Kick a user from the voice channel',
            options: [{
                type: 6, // USER type
                name: 'user',
                description: 'The user to kick from the voice channel',
                required: true
            }]
        },
        {
            name: 'vcban',
            description: 'Ban a user from the voice channel',
            options: [{
                type: 6, // USER type
                name: 'user',
                description: 'The user to ban from the voice channel',
                required: true
            }]
        },
        {
            name: 'vcmute',
            description: 'Mute a user in the voice channel',
            options: [{
                type: 6, // USER type
                name: 'user',
                description: 'The user to mute in the voice channel',
                required: true
            }]
        },
        {
            name: 'vcunmute',
            description: 'Mute a user in the voice channel',
            options: [{
                type: 6, // USER type
                name: 'user',
                description: 'The user to unmute in the voice channel',
                required: true
            }]
        },
        {
            name: 'broadcast',
            description: 'Send a message to all online players',
            options: [{
                type: 3, // STRING type
                name: 'message',
                description: 'The message to broadcast to all players',
                required: true
            }]
        }
    ];

    const rest = new REST({ version: '9' }).setToken(DISCORD_TOKEN);

    (async () => {
        try {
            console.log("Register Commands", 'Started refreshing application (/) commands.');

            await rest.put(
                Routes.applicationGuildCommands(config.applicationID, config.guildID),
                { body: commands }
            );

            console.log("Register Commands", 'Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error(error);
        }
    })();
};

module.exports = setupRegisterCommands;
