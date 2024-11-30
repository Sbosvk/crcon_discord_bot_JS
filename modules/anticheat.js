const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

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

// Function to process kill data
const processKillData = async (killData, config, pool) => {
    try {
        const description = killData.description || '';
        const timestamp = new Date(killData.timestamp).getTime();

        // Parse killer and victim information
        const parts = description.split("->");
        if (parts.length !== 2) {
            console.warn("anticheat", "Unexpected kill data format:", { description });
            return;
        }

        // Extract killer details
        const killerDetails = parts[0].match(/KILL: (.*?) \((.*?)\/(.*?)\)/);
        if (!killerDetails) {
            console.warn("anticheat", "Failed to parse killer details:", { description });
            return;
        }

        const [, killerName, killerTeam, killerSteamID] = killerDetails;

        // Extract victim details and weapon
        const victimAndWeapon = parts[1].split(" with ");
        if (victimAndWeapon.length !== 2) {
            console.warn("anticheat", "Failed to parse victim or weapon details:", { description });
            return;
        }

        const victimDetails = victimAndWeapon[0].match(/(.*?) \((.*?)\/(.*?)\)/);
        if (!victimDetails) {
            console.warn("anticheat", "Failed to parse victim details:", { description });
            return;
        }

        const [, victimName, victimTeam, victimSteamID] = victimDetails;
        const weapon = victimAndWeapon[1].trim();

        // Fetch or initialize player data
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

        // Update player stats
        playerData.killCount += 1;
        playerData.killStreak += 1;
        playerData.timestamps.push(timestamp);
        playerData.weaponUsage[weapon] = (playerData.weaponUsage[weapon] || 0) + 1;

        // Filter timestamps within the configured timeframe
        playerData.timestamps = playerData.timestamps.filter(
            t => timestamp - t <= config.timeframe * 60 * 1000
        );

        // Trigger alerts based on thresholds
        if (playerData.timestamps.length >= config.alertThreshold) {
            try {
                await triggerAlert(playerData, config);
            } catch (alertError) {
                console.error("anticheat", "Error triggering alert:", alertError);
            }
        }

        if (playerData.killStreak >= config.killStreakThreshold) {
            try {
                await triggerStreakAlert(playerData, config);
            } catch (streakError) {
                console.error("anticheat", "Error triggering streak alert:", streakError);
            }
        }

        // Save updated player data
        await savePlayerData(pool, playerData);
    } catch (error) {
        const errorMessage = error.message || "Unknown error";
        console.error("anticheat", "Error processing kill data:", { errorMessage, stack: error.stack || error });
    }
};


// Native webhook handler
const nativeWebhook = async (data, config, pool) => {
    if (!data || !data.embeds || data.embeds.length === 0) {
        console.warn("anticheat", "No valid embed data received.");
        return;
    }

    const killData = data.embeds[0];
    await processKillData(killData, config, pool);
};

// Discord module handler
const discordModule = (client, pool, config) => {
    client.on("messageCreate", async (message) => {
        if (message.channelId === config.channelID && message.embeds.length > 0) {
            const killData = message.embeds[0];
            await processKillData(killData, config, pool);
        }
    });
};

// Trigger an alert for a killing spree
const triggerAlert = async (playerData, config) => {
    console.log("anticheat", `Alert: Player ${playerData.playerName} is on a killing spree!`);
    const weaponStats = Object.entries(playerData.weaponUsage)
        .map(([weapon, count]) => `${weapon}: ${count} kills`)
        .join("\n");

    console.log("anticheat", `Weapon usage during spree:\n${weaponStats}`);
};

// Trigger an alert for a long kill streak
const triggerStreakAlert = async (playerData, config) => {
    console.log("anticheat", `Alert: Player ${playerData.playerName} has an unusually long kill streak!`);
    const weaponStats = Object.entries(playerData.weaponUsage)
        .map(([weapon, count]) => `${weapon}: ${count} kills`)
        .join("\n");

    console.log("anticheat", `Weapon usage during streak:\n${weaponStats}`);
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
