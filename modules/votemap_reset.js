const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const fetchResetData = async (pool, key) => {
    return pool
        .query("SELECT * FROM votemap_reset WHERE key = $1", [key])
        .then((res) => {
            console.log("🧩", `Fetched reset data for key: ${key}`);
            const row = res.rows[0];

            if (row) {
                return {
                    timestamp: row.timestamp && !isNaN(parseInt(row.timestamp, 10)) ? parseInt(row.timestamp, 10) : null, // Convert timestamp and ensure it's number
                    playerCount: row.playercount && !isNaN(parseInt(row.playercount, 10)) ? parseInt(row.playercount, 10) : null, // Convert timestamp and ensure it's number
                }
            }
            return null;
        })
        .catch((err) => {
            console.error(
                "🧩",
                `Error fetching reset data for key: ${key}`,
                err
            );
            throw err;
        });
};

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

    return pool
        .query(query, values)
        .then(() => {
            console.log(
                "🧩",
                `Saved reset data for key: ${key}, playerCount: ${playerCount}`
            );
        })
        .catch((err) => {
            console.error("🧩", `Error saving reset data for key: ${key}`, err);
            throw err;
        });
};

module.exports = async (client, pool, config) => {
    const updateInterval = parseInt(config.updateInterval, 10) * 1000;
    const channelID = config.channelID || null;
    const cooldownPeriod = parseInt(config.cooldownPeriod || 300000, 10); // Default 5 mins

    const makeCheck = async (retryCount = 0) => {
        try {
            const public_info = await api
                .get_public_info()
                .then((res) => {
                    console.log("🧩", "Public info fetched successfully.");
                    return res;
                })
                .catch((err) => {
                    console.error("🧩", "Error fetching public info:", err);
                    throw err;
                });

            const seedConfig = await api
                .get_auto_mod_seeding_config()
                .then((res) => {
                    console.log(
                        "🧩",
                        "Auto-mod seeding config fetched successfully."
                    );
                    return res;
                })
                .catch((err) => {
                    console.error(
                        "🧩",
                        "Error fetching auto-mod seeding config:",
                        err
                    );
                    throw err;
                });

            const playerCount = public_info.player_count;
            const maxPlayers = seedConfig.enforce_cap_fight.max_players;
            const now = Date.now();

            const lastReset = await fetchResetData(pool, "lastMapReset");
            const isCurrentlySeeding = playerCount < maxPlayers;
            const wasPreviouslySeeding = lastReset ? (lastReset.playerCount < maxPlayers) : false;

            // If we have no previous record, perform an initial reset and record the state
            if (!lastReset) {
                await performVotemapReset(api, pool, now, playerCount);
                console.log("🧩", "Initial votemap state reset performed.");
                return;
            }

            // Perform reset only on state change and after cooldown
            if (wasPreviouslySeeding !== isCurrentlySeeding) {
                if (now - lastReset.timestamp > cooldownPeriod) {
                    await performVotemapReset(api, pool, now, playerCount);
                    console.log(
                        "🧩",
                        `Votemap state reset due to state change. Server is now ${
                            isCurrentlySeeding ? "seeding" : "not seeding"
                        }.`
                    );
                } else {
                    console.log(
                        "🧩",
                        `State change detected, but cooldown period not yet elapsed. Last reset: ${new Date(
                            lastReset.timestamp
                        )}, Cooldown ends: ${new Date(
                            lastReset.timestamp + cooldownPeriod
                        )}`
                    );
                }
            } else {
                console.log(
                    "🧩",
                    "No state change detected. No reset performed."
                );
            }
        } catch (error) {
            console.error("🧩", "Error in votemap reset logic:", error);

            if (retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000;
                console.log(
                    "🧩",
                    `Retrying in ${delay} ms... Attempt: ${retryCount + 1}`
                );
                setTimeout(() => makeCheck(retryCount + 1), delay);
            } else {
                if (channelID) {
                    alertAdmin(
                        client,
                        channelID,
                        "Failed to reset votemap state after multiple attempts."
                    );
                }
            }
        }
    };

    console.log(
        "🧩",
        `Scheduling votemap reset check every ${updateInterval / 1000} seconds.`
    );
    setInterval(makeCheck, updateInterval);
};

const performVotemapReset = async (api, pool, timestamp, playerCount) => {
    return api
        .reset_votemap_state()
        .then(() => {
            console.log("🧩", "Votemap state reset executed.");
            return saveResetData(pool, "lastMapReset", {
                timestamp,
                playerCount,
            });
        })
        .catch((err) => {
            console.error("🧩", "Error performing votemap reset:", err);
            throw err;
        });
};

const alertAdmin = async (client, channelID, message) => {
    try {
        const channel = await client.channels.fetch(channelID);
        if (channel) {
            await channel.send(`ALERT: ${message}`);
        } else {
            console.warn("🧩", "Channel not found for admin alert.");
        }
    } catch (error) {
        console.error("🧩", "Failed to send admin alert:", error);
    }
};
