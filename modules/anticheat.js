const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const { Client, EmbedBuilder } = require("discord.js");

// Function to process kill data from both native webhooks and Discord messages
const processKillData = async (killData, config, db) => {
    console.log("anticheat", "Processing kill data:", killData);

    const description = killData.description || '';
    const timestamp = new Date(killData.timestamp).getTime();

    // Extract player and weapon information using regex
    const match = description.match(/KILL: \[(.*?)\]\(.*\/(\d+)\) -> \[(.*?)\]\(.*\/(\d+)\) with (.+)/);

    if (match) {
        const killerName = match[1];
        const killerSteamID = match[2];
        const victimName = match[3];
        const victimSteamID = match[4];
        const weapon = match[5];

        console.log("anticheat", `Killer: ${killerName}, Victim: ${victimName}, Weapon: ${weapon}`);

        // Load or initialize player data
        let playerData = await db.findOne({ steamID: killerSteamID });
        if (!playerData) {
            playerData = { 
                steamID: killerSteamID, 
                playerName: killerName, 
                killCount: 0, 
                timestamps: [], 
                killStreak: 0, 
                weaponUsage: {} 
            };
        }

        // Update player data
        playerData.killCount += 1;
        playerData.killStreak += 1;
        playerData.timestamps.push(timestamp);

        // Track weapon usage
        if (!playerData.weaponUsage[weapon]) {
            playerData.weaponUsage[weapon] = 0;
        }
        playerData.weaponUsage[weapon] += 1;

        // Remove old timestamps outside of the timeframe
        playerData.timestamps = playerData.timestamps.filter(t => timestamp - t <= config.timeframe * 60 * 1000);

        // Check for killing spree
        if (playerData.timestamps.length >= config.alertThreshold) {
            await triggerAlert(playerData, config);
        }

        // Check for kill streak
        if (playerData.killStreak >= config.killStreakThreshold) {
            await triggerStreakAlert(playerData, config);
        }

        await db.update({ steamID: killerSteamID }, playerData, { upsert: true });
    } else {
        console.error("anticheat", "Failed to parse kill data.");
    }
};

// Native webhook handler
const nativeWebhook = (data, config, db) => {
    const killData = data.embeds[0]; // Assuming this structure from the webhook
    processKillData(killData, config, db);
};

// Discord module handler
const discordModule = (client, db, config) => {
    client.on("messageCreate", async (message) => {
        if (message.channelId === config.channelID && message.embeds.length > 0) {
            const killData = message.embeds[0]; // Assuming this structure from the Discord message
            processKillData(killData, config, db);
        }
    });
};

// Trigger an alert for a killing spree
const triggerAlert = async (playerData, config) => {
    console.log("anticheat", `Alert: Player ${playerData.playerName} is on a killing spree!`);
    
    let weaponStats = "";
    for (const [weapon, count] of Object.entries(playerData.weaponUsage)) {
        weaponStats += `${weapon}: ${count} kills\n`;
    }

    console.log("anticheat", `Weapon usage during spree:\n${weaponStats}`);
    
    // Logic to send the alert to Discord or another medium
};

// Trigger an alert for a long kill streak
const triggerStreakAlert = async (playerData, config) => {
    console.log("anticheat", `Alert: Player ${playerData.playerName} has an unusually long kill streak!`);
    
    let weaponStats = "";
    for (const [weapon, count] of Object.entries(playerData.weaponUsage)) {
        weaponStats += `${weapon}: ${count} kills\n`;
    }

    console.log("anticheat", `Weapon usage during streak:\n${weaponStats}`);
    
    // Logic to send the alert to Discord or another medium
};

// Export the module
module.exports = (client, db, config) => {
    if (config.webhook) {
        console.log("anticheat", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, db), // Add processWebhookData to handle webhook data
        };
    } else {
        console.log("anticheat", "Using Discord mode.");
        return discordModule(client, db, config);
    }
};
