const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const { MessageType } = require("discord.js");

function extractSteamIDFromURL(url) {
    const match = url.match(/\/profiles\/(\d+)/);
    return match ? match[1] : null;
}

const nativeWebhook = (data, config, db) => {
    // Handle the incoming webhook data here
    console.log("Admin Ping Monitor", "Received native webhook data:", data);
    
    // Assuming data is in the same format as the Discord webhook:
    const reportBody = data.embeds[0].description;
    const reporterInfo = data.embeds[0].author.name;
    const steamProfileUrl = data.embeds[0].author.url;
    const steamId64 = extractSteamIDFromURL(steamProfileUrl);

    // Similar logic to process the data as in the Discord module
    processAdminPing(reportBody, reporterInfo, steamId64, config);
};

const discordModule = (client, db, config) => {
    client.on("messageCreate", async (message) => {
        // Check if the message is from the monitored channel and is a webhook message
        if (message.webhookId && message.channelId === config.channelID) {
            const embed = message.embeds[0];
            if (embed) {
                const reportBody = embed.description;
                const reporterInfo = embed.author.name;
                const steamProfileUrl = embed.author.url;
                const steamId64 = extractSteamIDFromURL(steamProfileUrl);

                processAdminPing(reportBody, reporterInfo, steamId64, config);
            }
        }
    });
};

const processAdminPing = async (reportBody, reporterInfo, steamId64, config) => {
    try {
        // Fetch online mods from the API
        const modData = await api.get_ingame_mods();
        const onlineMods = modData.result;

        if (Array.isArray(onlineMods)) {
            for (const mod of onlineMods) {
                const modSteamId64 = mod.player_id;
                const discordMapping = config.adminMappings.find(
                    (mapping) => mapping.steamID === modSteamId64
                );

                if (discordMapping) {
                    try {
                        const sanitizedMessage = sanitizeMessageContent(reportBody);
                        const messageToSend = `${reporterInfo} reported:\n\n${sanitizedMessage}`;
                        
                        const response = await api.message_player({
                            player_name: reporterInfo || "Unknown Reporter",
                            player_id: modSteamId64,
                            message: messageToSend || "No report content provided.",
                            by: reporterInfo || "Unknown Reporter",
                            save_message: false,
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
            console.error("Admin Ping Monitor", "No online mods found or invalid data structure.");
        }
    } catch (error) {
        console.error("Admin Ping Monitor", "Error processing admin ping:", error);
    }
};

function sanitizeMessageContent(message) {
    return message
        .replace(/!admin\s*/i, '') // Removes "!admin" and any following whitespace
        .replace(/[_*~`>]/g, '')    // Removes _ * ~ ` > symbols
        .replace(/\\/g, '');        // Removes backslashes introduced by sanitization
}

module.exports = (client, db, config) => {
    if (config.webhook) {
        console.log("Admin Ping Monitor", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, db),
        };
    } else {
        console.log("Admin Ping Monitor", "Using Discord mode.");
        return discordModule(client, db, config);
    }
};
