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
    if (!config.discord_notification && !config.ingame_notification) return;

    const recordBaseUrl = process.env.PLAYER_RECORDS_BASE_URL || "undefined";
    try {
        const aka = player.names.slice(1); // Take all names except the first
        if (config.ingame_notification) {
            // Notify in-game admins
            const onlineMods = await api.get_ingame_mods();
            if (onlineMods && Array.isArray(onlineMods)) {
                for (const mod of onlineMods) {
                    const message = `Watchlisted player ${player.names[0]} is online.\n\n`
                    + `Also known as:\n${aka.join("- \n")}\n\n`
                    + `Watching reason: ${player.reason}`;
                    await api.message_player({
                        player_id: mod.player_id,
                        message: message,
                        by: "Watchlist Monitor",
                    });
                    console.log("🧩", `Notified admin ${mod.username} about ${player.names[0]}.`);
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
                        `Player **${player.player_name}** is now online.`
                    )
                    .addFields(
                        {
                            name: "Profile",
                            value: `[${player.names[0]}](${recordBaseUrl}${player_id})`,
                            inline: true,
                        },
                        {
                            name: "AKA",
                            value: (aka.length > 0) ? aka.join(", ") : "N/A",
                            inline: true,
                        },
                        {
                            name: "Watching reason",
                            value: player.reason,
                            inline: true,
                        }
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
        let player = await isWatched(log);
        if (player.result) {
            console.log("isWatched returned:", player)
            await processWatchlistNotification(client, config, player);
        }
     });
};
