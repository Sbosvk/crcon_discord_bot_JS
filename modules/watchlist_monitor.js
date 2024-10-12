const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const { MessageEmbed } = require("discord.js");

// Extract SteamID from the player object (profile URL, etc.)
function extractSteamIDFromProfile(player) {
    const profileUrl = player.profile_url;
    const match = profileUrl.match(/\/profiles\/(\d+)/);
    return match ? match[1] : null;
}

// Process watchlist notification
const processWatchlistNotification = async (watchlistPlayer, config, db, client) => {
    try {
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
                    console.log(`Watchlist Monitor: Notified admin ${mod.player_name} about ${watchlistPlayer.player_name}.`);
                }
            }
        } else {
            console.error("Watchlist Monitor: No online mods found or invalid data structure.");
        }

        // Notify Discord channel
        const channel = await client.channels.fetch(config.channelID);
        if (channel) {
            const embed = new MessageEmbed()
                .setTitle("TEST: Watchlisted Player Online")
                .setDescription(`Player **${watchlistPlayer.player_name}** is now online. [Steam Profile](https://steamcommunity.com/profiles/${watchlistPlayer.player_id})`)
                .setColor("RED")
                .setTimestamp();
            await channel.send({ embeds: [embed] });
            console.log("Watchlist Monitor: Sent Discord notification.");
        }
    } catch (error) {
        console.error("Watchlist Monitor: Error notifying watchlisted player:", error);
    }
};

// Native webhook handler for watchlist notifications
const nativeWebhook = async (data, config, db, client) => {
    console.log("Watchlist Monitor: Received webhook data:", data);

    // Extract watchlist player information
    const watchlistPlayer = data.embeds[0]; // Assuming watchlist notification contains player details

    if (watchlistPlayer) {
        const playerName = watchlistPlayer.description;
        const steamId64 = extractSteamIDFromProfile(watchlistPlayer);

        if (steamId64) {
            console.log(`Watchlist Monitor: Detected watchlisted player ${playerName} (Steam ID: ${steamId64})`);
            await processWatchlistNotification({ player_name: playerName, player_id: steamId64 }, config, db, client);
        } else {
            console.error("Watchlist Monitor: Failed to extract Steam ID from player profile.");
        }
    } else {
        console.error("Watchlist Monitor: Invalid watchlist data.");
    }
};

// Discord webhook handler for watchlist notifications
const discordModule = (client, db, config) => {
    client.on("messageCreate", async (message) => {
        if (message.webhookId && message.channelId === config.channelID) {
            const embed = message.embeds[0];
            if (embed) {
                const playerName = embed.description;
                const steamId64 = extractSteamIDFromProfile(embed);

                if (steamId64) {
                    await processWatchlistNotification({ player_name: playerName, player_id: steamId64 }, config, db, client);
                } else {
                    console.error("Watchlist Monitor: Failed to extract Steam ID from player profile.");
                }
            }
        }
    });
};

// Export the module
module.exports = (client, db, config) => {
    if (config.webhook) {
        console.log("Watchlist Monitor: Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, db, client),
        };
    } else {
        console.log("Watchlist Monitor: Using Discord mode.");
        return discordModule(client, db, config);
    }
};
