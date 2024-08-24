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
                    const onlineMods = modData.result; // Use the result array directly

                    if (Array.isArray(onlineMods)) {
                        // Iterate through online mods and check if they are in the adminMappings
                        for (const mod of onlineMods) {
                            const modSteamId64 = mod.player_id; // Adjusted to match your actual data structure
                            const discordMapping = config.adminMappings.find(
                                (mapping) => mapping.steamID === modSteamId64
                            );

                            function sanitizeMessageContent(message) {
                                // Remove "!admin" from the message
                                return message
                                    .replace(/!admin\s*/i, '') // Removes "!admin" and any following whitespace
                                    .replace(/[_*~`>]/g, '')    // Removes _ * ~ ` > symbols
                                    .replace(/\\/g, '');        // Removes backslashes introduced by sanitization
                            }

                            if (discordMapping) {
                                try {
                                    // Sanitize the report body before sending
                                    let sanitizedMessage = sanitizeMessageContent(reportBody);

                                    sanitizedMessage = `${reporterInfo} reported:\n\n${sanitizedMessage}`;
                            
                                    const response = await api.message_player({
                                        player_name: reporterInfo || "Unknown Reporter",  // Reporter info
                                        player_id: modSteamId64,  // Mod's Steam ID
                                        message: sanitizedMessage || "No report content provided.",  // Sanitized report content
                                        by: reporterInfo || "Unknown Reporter",  // Who is sending the message
                                        save_message: false  // Assuming this is a boolean flag for a specific feature
                                    });
                            
                                    if (response.result && response.result.toLowerCase() === "success") {
                                        console.log("Admin Ping Monitor", "Message sent successfully to in-game admin.");
                                    } else {
                                        console.error("Admin Ping Monitor", "Failed to send message to in-game admin:", response.statusText);
                                    }
                            
                                } catch (error) {
                                    console.error("Admin Ping Monitor", "Error sending message to in-game admin:", error);
                                }
                            }
                        }
                    } else {
                        console.error(
                            "No online mods found or invalid data structure."
                        );
                    }
                } catch (error) {
                    console.error("Admin Ping Monitor", "Error processing admin ping:", error);
                }
            }
        }
    });

    function extractSteamIDFromURL(url) {
        const match = url.match(/\/profiles\/(\d+)/);
        return match ? match[1] : null;
    }
};
