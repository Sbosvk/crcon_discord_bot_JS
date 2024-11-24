const API = require("crcon.js");
require("dotenv").config();
const { EmbedBuilder } = require("discord.js");

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Initialize PostgreSQL table for the watchlist monitor
const initializeTable = async (pool) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS watchlist_monitor (
            player_id TEXT PRIMARY KEY,
            player_name TEXT,
            last_notified TIMESTAMP DEFAULT NULL
        );
    `;
    await pool.query(createTableQuery);
};

// Extract SteamID from the player profile
function extractSteamIDFromProfile(player) {
    const profileUrl = player.profile_url;
    const match = profileUrl.match(/\/profiles\/(\d+)/);
    return match ? match[1] : null;
}

// Process watchlist notification
const processWatchlistNotification = async (watchlistPlayer, config, pool, client) => {
    try {
        const now = new Date().toISOString();

        // Notify in-game admins
        const onlineMods = await api.get_ingame_mods();
        if (onlineMods.result && Array.isArray(onlineMods.result)) {
            for (const mod of onlineMods.result) {
                const modSteamId64 = mod.player_id;
                const discordMapping = config.adminMappings.find(
                    (mapping) => mapping.steamID === modSteamId64
                );

                if (discordMapping) {
                    const message = `Watchlisted player ${watchlistPlayer.player_name} is online. Steam ID: ${watchlistPlayer.player_id}`;
                    await api.message_player({
                        player_name: mod.player_name,
                        player_id: modSteamId64,
                        message: message,
                        by: "Watchlist Monitor",
                        save_message: false,
                    });
                    console.log(`Watchlist Monitor", "Notified admin ${mod.player_name} about ${watchlistPlayer.player_name}.`);
                }
            }
        } else {
            console.error("Watchlist Monitor", "No online mods found or invalid data structure.");
        }

        // Notify Discord channel
        const channel = await client.channels.fetch(config.channelID);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle("🚨 Watchlisted Player Online")
                .setDescription(
                    `Player **${watchlistPlayer.player_name}** is now online. [Steam Profile](https://steamcommunity.com/profiles/${watchlistPlayer.player_id})`
                )
                .setColor(0xff0000)
                .setTimestamp();
            await channel.send({ embeds: [embed] });
            console.log("Watchlist Monitor", "Sent Discord notification.");
        }

        // Update the database with the last notification timestamp
        const updateQuery = `
            INSERT INTO watchlist_monitor (player_id, player_name, last_notified)
            VALUES ($1, $2, $3)
            ON CONFLICT (player_id)
            DO UPDATE SET 
                player_name = EXCLUDED.player_name,
                last_notified = EXCLUDED.last_notified;
        `;
        await pool.query(updateQuery, [watchlistPlayer.player_id, watchlistPlayer.player_name, now]);
    } catch (error) {
        console.error("Watchlist Monitor", "Error notifying watchlisted player:", error);
    }
};

// Native webhook handler for watchlist notifications
const nativeWebhook = async (data, config, pool, client) => {
    console.log("Watchlist Monitor", "Received webhook data");

    const watchlistPlayer = data.embeds[0]; // Assuming webhook payload contains player details

    if (watchlistPlayer) {
        const playerName = watchlistPlayer.description;
        const steamId64 = extractSteamIDFromProfile(watchlistPlayer);

        if (steamId64) {
            console.log(`Watchlist Monitor", "Detected watchlisted player ${playerName} (Steam ID: ${steamId64})`);
            await processWatchlistNotification({ player_name: playerName, player_id: steamId64 }, config, pool, client);
        } else {
            console.error("Watchlist Monitor", "Failed to extract Steam ID from player profile.");
        }
    } else {
        console.error("Watchlist Monitor", "Invalid watchlist data.");
    }
};

// Discord webhook handler for watchlist notifications
const discordModule = (client, pool, config) => {
    const webhookChannelID = config.channelID;

    client.on("messageCreate", async (message) => {
        if (message.webhookId && message.channelId === webhookChannelID) {
            const embed = message.embeds[0];
            if (embed) {
                const playerName = embed.description;
                const steamId64 = extractSteamIDFromProfile(embed);

                if (steamId64) {
                    await processWatchlistNotification({ player_name: playerName, player_id: steamId64 }, config, pool, client);
                } else {
                    console.error("Watchlist Monitor", "Failed to extract Steam ID from player profile.");
                }
            }
        }
    });
};

// Export the module
module.exports = async (client, pool, config) => {
    await initializeTable(pool);

    if (config.webhook) {
        console.log("Watchlist Monitor", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, pool, client),
        };
    } else {
        console.log("Watchlist Monitor", "Using Discord mode.");
        return discordModule(client, pool, config);
    }
};
