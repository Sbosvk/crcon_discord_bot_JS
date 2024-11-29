const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Initialize the PostgreSQL table for votemap reset
const initializeTable = async (pool) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS votemap_reset (
            key TEXT PRIMARY KEY,
            timestamp BIGINT,
            playerCount INTEGER
        );
    `;
    await pool.query(createTableQuery);
};

// Fetch votemap reset data from the database
const fetchResetData = async (pool, key) => {
    const result = await pool.query("SELECT * FROM votemap_reset WHERE key = $1", [key]);
    return result.rows[0];
};

// Save votemap reset data to the database
const saveResetData = async (pool, key, data) => {
    const { timestamp, playerCount } = data;
    const query = `
        INSERT INTO votemap_reset (key, timestamp, playerCount)
        VALUES ($1, $2, $3)
        ON CONFLICT (key)
        DO UPDATE SET 
            timestamp = EXCLUDED.timestamp,
            playerCount = EXCLUDED.playerCount;
    `;
    const values = [key, timestamp, playerCount];
    await pool.query(query, values);
};

const controlMapReset = async (client, pool, config) => {
    const updateInterval = parseInt(config.updateInterval) * 1000; // Convert to milliseconds
    const channelID = config.channelID || null;
    const cooldownPeriod = parseInt(config.cooldownPeriod || 5 * 60 * 1000); // Default to 5 minutes if not provided

    const makeCheck = async (retryCount = 0) => {
        try {
            let public_info = await api.get_public_info();
            public_info = public_info.result;
            const playerCount = public_info.player_count;
    
            const seedConfig = await api.get_auto_mod_seeding_config();
            const maxPlayers = seedConfig.result.enforce_cap_fight.max_players;
    
            const lastReset = await fetchResetData(pool, "lastMapReset");
            const now = Date.now();
    
            const lastResetAboveMax = lastReset && lastReset.playerCount > maxPlayers;
            const currentAboveMax = playerCount > maxPlayers;
    
            if (lastReset) {
                if (
                    lastResetAboveMax !== currentAboveMax &&
                    now - lastReset.timestamp > cooldownPeriod
                ) {
                    await api
                        .reset_votemap_state()
                        .then(() => {
                            console.log(`votemap_reset: Votemap state reset due to player count change.`);
                            return saveResetData(pool, "lastMapReset", { timestamp: now, playerCount });
                        })
                        .then(() => {
                            console.log(`Saved reset data successfully. Player count: ${playerCount}`);
                            const seedingStatus = playerCount < maxPlayers ? "seeding" : "not seeding";
                            console.log(`Seeding status: ${seedingStatus}`);
                        })
                        .catch((error) => {
                            console.error("Error saving reset data:", error);
                            throw error;
                        });
                }
            } else {
                await api
                    .reset_votemap_state()
                    .then(() => {
                        console.log(`votemap_reset: Initial votemap state reset.`);
                        return saveResetData(pool, "lastMapReset", { timestamp: now, playerCount });
                    })
                    .then(() => {
                        console.log(`Initial reset data saved successfully. Player count: ${playerCount}`);
                    })
                    .catch((error) => {
                        console.error("Error during initial reset or save:", error);
                        throw error;
                    });
            }
        } catch (error) {
            console.error("Error resetting votemap state:", error);
    
            if (retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000;
                console.log(`votemap_reset: Retrying in ${delay} ms... Attempt: ${retryCount + 1}`);
                setTimeout(() => makeCheck(retryCount + 1), delay);
            } else {
                if (channelID) {
                    alertAdmin(client, channelID, "Failed to reset votemap state after multiple attempts.");
                }
                
            }
        }
    };
    setInterval(makeCheck, updateInterval);
}

const alertAdmin = async (client, channelID, message) => {
    try {
        const channel = await client.channels.fetch(channelID);
        if (channel) {
            await channel.send(`ALERT: ${message}`);
        }
    } catch (error) {
        console.error("Failed to send admin alert:", error);
    }
};

module.exports = async (client, pool, config) => {
    await initializeTable(pool);
    controlMapReset(client, pool, config);
};
