const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const RCON_API_URL = process.env.CRCON_API_URL;
const api = new API(RCON_API_URL, { token: CRCON_API_TOKEN });

const { MessageType } = require("discord.js");

module.exports = (client, db, config) => {
    client.on("messageCreate", async message => {
        if (message.type === MessageType.Reply && message.channelId === config.channelID) {
            const refMessage = await message.fetchReference();
            if (refMessage && refMessage.embeds.length > 0) {
                const embed = refMessage.embeds[0];
                if (embed.author && embed.author.url) {
                    const steamId64 = extractSteamIDFromURL(embed.author.url);
                    if (steamId64) {
                        try {
                            const response = await api.doMessagePlayer(null, steamId64, message.content, message.author.username, false);
                            if (response.result.toLowerCase() == "success") {
                                await message.reply('Admin message sent successfully!');
                            } else {
                                await message.reply(`Failed to send admin ping: ${response.statusText}`);
                            }
                        } catch (error) {
                            await message.reply('Failed to send message due to an error.');
                            console.error(error);
                        }
                    } else {
                        await message.reply("Could not find a valid Steam profile link in the referenced message.");
                    }
                }
            }
        }
    });

    function extractSteamIDFromURL(url) {
        const match = url.match(/\/profiles\/(\d+)/);
        return match ? match[1] : null;
    }
};
