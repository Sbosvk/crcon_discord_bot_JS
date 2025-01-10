const { logStreamManager } = require('./log_stream_manager');
const { isCommand, isAdminping } = require('../utils/logStream');
const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const processAdminPing = async (log, config, adminPingMessage) => {
    try {
        const player_id = log.player_id_1;
        const reporterInfo = log.player_name_1;

        // Fetch online mods from the API
        const modData = await api.get_ingame_mods();
        const onlineMods = modData;

        if (Array.isArray(onlineMods)) {
            for (const mod of onlineMods) {
                const modplayer_id = mod.player_id;
                const discordMapping = config.adminMappings.find(
                    (mapping) => mapping.steamID === modplayer_id
                );

                if (discordMapping) {
                    try {
                        const messageToSend = `${reporterInfo} reported:\n\n${adminPingMessage}`;

                        const response = await api.message_player({
                            player_name: reporterInfo,
                            player_id: modplayer_id,
                            message: messageToSend || "No report content provided.",
                            by: reporterInfo,
                        });

                        if (response) {
                            console.log("🧩", "Message sent successfully to in-game admin.");
                        } else {
                            console.error("🧩", "Failed to send message to in-game admin:", response.statusText);
                        }
                    } catch (error) {
                        console.error("🧩", "Error sending message to in-game admin:", error);
                    }
                }
            }
        } else {
            console.error("🧩", "No online mods found or invalid data structure.");
        }
    } catch (error) {
        console.error("🧩", "Error processing admin ping:", error);
    }
};

module.exports = (client, pool, config) => {
    // Subscribe to `CHAT` action in the log stream
    logStreamManager.subscribe("CHAT");

    logStreamManager.on("CHAT", async (log) => {
        try {
            const commandCheck = isCommand(log);
            if (!commandCheck.result) return; // Not a command, ignore

            const adminPingCheck = isAdminping(log);
            if (adminPingCheck.result) {
                console.log("🧩 Admin ping detected:", log);
                await processAdminPing(log, config);
            }
        } catch (error) {
            console.error("🧩 Error processing CHAT log for admin ping:", error);
        }
    });
};
