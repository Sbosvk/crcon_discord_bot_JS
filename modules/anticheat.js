const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const { Client, EmbedBuilder } = require("discord.js");

// Function to initialize the anticheat table
const initializeTable = async (pool) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS anticheat (
            steamID TEXT PRIMARY KEY,
            playerName TEXT,
            killCount INTEGER DEFAULT 0,
            killStreak INTEGER DEFAULT 0,
            timestamps JSONB DEFAULT '[]',
            weaponUsage JSONB DEFAULT '{}'
        );
    `;
    await pool.query(createTableQuery);
};

// Function to fetch player data from the database
const fetchPlayerData = async (pool, steamID) => {
    const result = await pool.query("SELECT * FROM anticheat WHERE steamID = $1", [steamID]);
    return result.rows[0];
};

// Function to save player data to the database
const savePlayerData = async (pool, playerData) => {
    const { steamID, playerName, killCount, killStreak, timestamps, weaponUsage } = playerData;
    const query = `
        INSERT INTO anticheat (steamID, playerName, killCount, killStreak, timestamps, weaponUsage)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (steamID)
        DO UPDATE SET 
            playerName = EXCLUDED.playerName,
            killCount = EXCLUDED.killCount,
            killStreak = EXCLUDED.killStreak,
            timestamps = EXCLUDED.timestamps,
            weaponUsage = EXCLUDED.weaponUsage;
    `;
    const values = [steamID, playerName, killCount, killStreak, JSON.stringify(timestamps), JSON.stringify(weaponUsage)];
    await pool.query(query, values);
};

// Function to process kill data from both native webhooks and Discord messages
const processKillData = async (killData, config, pool) => {
    const description = killData.description || '';
    const timestamp = new Date(killData.timestamp).getTime();

    // Extract killer and victim info
    const killerSection = description.split(" -> ")[0];
    const killerName = killerSection.split("(")[0].replace("KILL: ", "").trim();
    const killerSteamID = killerSection.split("/")[1].split(")")[0].trim();

    const victimSection = description.split(" -> ")[1];
    const victimName = victimSection.split("(")[0].trim();
    const victimSteamID = victimSection.split("/")[1].split(")")[0].trim();

    const weapon = victimSection.split("with ")[1].trim();
    
    if (!killerName | !killerSteamID || !victimName || !victimSteamID || !weapon) {
        return console.warn("🧩", 'Failed to parse kill data. Missing fields.')
    }

    if (killerName && killerSteamID && victimName && victimSteamID && weapon) {
        let playerData = await fetchPlayerData(pool, killerSteamID);

        if (!playerData) {
            playerData = {
                steamID: killerSteamID,
                playerName: killerName,
                killCount: 0,
                killStreak: 0,
                timestamps: [],
                weaponUsage: {}
            };
        }

        playerData.killCount += 1;
        playerData.killStreak += 1;
        playerData.timestamps.push(timestamp);
        playerData.weaponUsage[weapon] = (playerData.weaponUsage[weapon] || 0) + 1;

        playerData.timestamps = playerData.timestamps.filter(t => timestamp - t <= config.timeframe * 60 * 1000);

        if (playerData.timestamps.length >= config.alertThreshold) {
            await triggerAlert(playerData, config);
        }

        if (playerData.killStreak >= config.killStreakThreshold) {
            await triggerStreakAlert(playerData, config);
        }

        await savePlayerData(pool, playerData);
    }
};


// Native webhook handler
const nativeWebhook = (data, config, pool) => {
    const killData = data.embeds[0];
    processKillData(killData, config, pool);
};

// Discord module handler
const discordModule = (client, pool, config) => {
    client.on("messageCreate", async (message) => {
        if (message.channelId === config.channelID && message.embeds.length > 0) {
            const killData = message.embeds[0];
            processKillData(killData, config, pool);
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

// Initialize the module
module.exports = async (client, pool, config) => {
    await initializeTable(pool);

    if (config.webhook) {
        return {
            processWebhookData: (data) => nativeWebhook(data, config, pool),
        };
    } else {
        return discordModule(client, pool, config);
    }
};