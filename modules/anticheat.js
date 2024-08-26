const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const { Client, EmbedBuilder } = require("discord.js");

const nativeWebhook = async (data, config, db) => {
    // Handle the incoming webhook data here, e.g., for detecting kill sprees or long kill streaks
    console.log("anticheat", "Received webhook data:", data);

    // Placeholder: Process the data and detect kill sprees or streaks
    // Extract player ID, kill count, etc.
    // Compare against thresholds and time frames to trigger alerts

    // Example: Check if player is on a kill spree
    const playerId = data.player.id; // Assuming this is the correct structure
    const timestamp = data.timestamp; // The time of the kill
    const weapon = data.weapon; // Weapon used for the kill
    const kills = data.player.kills; // Current kill count for the player

    // Load or initialize player data
    let playerData = await db.findOne({ steamID: playerId });
    if (!playerData) {
        playerData = { steamID: playerId, killCount: 0, timestamps: [], killStreak: 0 };
    }

    // Update player data
    playerData.killCount += 1;
    playerData.killStreak += 1;
    playerData.timestamps.push(timestamp);

    // Remove old timestamps outside of the timeframe
    playerData.timestamps = playerData.timestamps.filter(t => timestamp - t <= config.timeframe * 60 * 1000);

    // Check for killing spree
    if (playerData.timestamps.length >= config.alertThreshold) {
        triggerAlert(playerData, config);
    }

    // Check for kill streak
    if (playerData.killStreak >= config.killStreakThreshold) {
        triggerStreakAlert(playerData, config);
    }

    await db.update({ steamID: playerId }, playerData, { upsert: true });
};

const processData = async () => {

}

const discordModule = (client, db, config) => {
    // Logic to handle Discord messages if not using native webhooks
};

const triggerAlert = async (playerData, config) => {
    // Logic to notify admins about a potential cheater via Discord or other means
    console.log("anticheat", `Alert: Player ${playerData.steamID} is on a killing spree!`);
};

const triggerStreakAlert = async (playerData, config) => {
    // Logic to notify admins about a potential cheater based on a long kill streak
    console.log("anticheat", `Alert: Player ${playerData.steamID} has an unusually long kill streak!`);
};

module.exports = (client, db, config) => {
    if (config.webhook) {
        console.log("anticheat", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, db),
        };
    } else {
        console.log("anticheat", "Using Discord mode.");
        return discordModule(client, db, config);
    }
};
