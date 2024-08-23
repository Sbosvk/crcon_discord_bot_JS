const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const { MessageType } = require("discord.js");

module.exports = (client, db, config) => {
    client.on("messageCreate", async (message) => {
        // Check if the message is from the monitored channel and is a webhook message
        if (message.webhookId && message.channelId === config.channelID) {
            const embed = message.embeds[0];
            if (embed) {
                const reportBody = embed.description; // Extract the report content from description
                const reporterInfo = embed.author.name; // Extract the reporter's name and team
                const steamProfileUrl = embed.author.url; // Extract the reporter's Steam profile URL

                // Extract the Steam ID from the URL
                const steamId64 = extractSteamIDFromURL(steamProfileUrl);

                try {
                    // Fetch online mods from the API
                    const modData = await api.get_ingame_mods();
                    const onlineMods = modData.result.mods;

                    // Iterate through online mods and check if they are in the adminMappings
                    for (const mod of onlineMods) {
                        const modSteamId64 = mod.steam_id_64;
                        const discordMapping = config.adminMappings.find(mapping => mapping.steamID === modSteamId64);

                        if (discordMapping) {
                            // Send the report to the in-game admin
                            await api.message_player(
                                null,
                                modSteamId64,
                                reportBody,
                                reporterInfo,
                                false
                            );

                            // Notify the admin on Discord
                            const adminUser = await client.users.fetch(discordMapping.discordID);
                            if (adminUser) {
                                await adminUser.send(`You have received an in-game report: \n\n**Reporter**: ${reporterInfo}\n**Report**: ${reportBody}`);
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error processing admin ping:", error);
                }
            }
        }
    });

    function extractSteamIDFromURL(url) {
        const match = url.match(/\/profiles\/(\d+)/);
        return match ? match[1] : null;
    }
};
