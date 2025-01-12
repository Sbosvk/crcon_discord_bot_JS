const { isWatched } = require("../utils/logStream.js");
const { logStreamManager } = require("./log_stream_manager");
const API = require("crcon.js");
require("dotenv").config();
const { EmbedBuilder } = require("discord.js");

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Process watchlist notification
const processWatchlistNotification = async (client, config, player) => {
    if (!config.discord_notification || !config.ingame_notification) return;
    try {
        if (config.ingame_notification) {
            // Notify in-game admins
            const onlineMods = await api.get_ingame_mods();
            if (onlineMods && Array.isArray(onlineMods)) {
                for (const mod of onlineMods) {
                    const message = `Watchlisted player ${player.player_name} is online.\n\nWatching reason: ${player.reason}`;
                    await api.message_player({
                        player_id: mod.player_id,
                        message: message,
                        by: "Watchlist Monitor",
                    });
                    console.log("🧩", `Notified admin ${mod.username} about ${player.player_name}.`);
                }
            } else {
                console.error("🧩", "No online mods found or invalid data structure.");
            }
        }

        if (config.discord_notification) {
            // Notify Discord channel
            const channel = await client.channels.fetch(config.channel_id);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle("🚨 Watchlisted Player Online")
                    .setDescription(
                        `Player **${player.player_name}** is now online. [Steam Profile](https://steamcommunity.com/profiles/${player.player_id})\n\nWatching reason: ${player.reason}`
                    )
                    .setColor(0xff0000)
                    .setTimestamp();
                await channel.send({ embeds: [embed] })
                    .then(() => console.log("🧩", "Sent watchlist notification"));
            }
        }
    } catch (error) {
        console.error("🧩", "Error notifying watchlisted player:", error);
    }
};


// Export the module
module.exports = async (client, pool, config) => {
     // Subscribe to `TEAM KILL` action
     logStreamManager.subscribe("CONNECTED");
 
     logStreamManager.on("CONNECTED", async (log) => {
        console.log("connected log received:", log)
        let player = await isWatched(log);
        if (player.result) {
            console.log("isWatched returned:", player)
            await processWatchlistNotification(client, config, player);
        }
     });
};
