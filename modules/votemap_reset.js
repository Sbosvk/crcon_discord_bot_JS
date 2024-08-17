const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const getConfigValue = async (configKey) => {
    try {
        const response = await api.get_auto_mod_seeding_config();
        return response.result ? response.result[configKey] : null;
    } catch (error) {
        console.error('Error fetching configuration:', error);
        return null;
    }
};

const controlMapReset = async (client, db, config) => {
    const updateInterval = parseInt(config.updateInterval) * 1000; // Convert to milliseconds
    const channelID = config.channelID;
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes cooldown

    const makeCheck = async (retryCount = 0) => {
        try {
            const public_info = await api.public_info();
            const playerCount = public_info.result.player_count;
            const maxPlayers = await getConfigValue('enforce_cap_fight.max_players');
            const lastReset = await db.findOne({ key: "lastMapReset" });
            const now = Date.now();

            if (maxPlayers && playerCount > maxPlayers) {
                if (!lastReset || (now - lastReset.timestamp > cooldownPeriod)) {
                    await api.reset_votemap_state();

                    const channel = await client.channels.fetch(channelID);
                    if (channel) {
                        await channel.send("Server seeded. Votemap state reset.");
                    }

                    await db.update(
                        { key: "lastMapReset" },
                        { $set: { timestamp: now, playerCount } },
                        { upsert: true }
                    );
                }
            } else if (playerCount <= maxPlayers) {
                if (!lastReset || (now - lastReset.timestamp > cooldownPeriod)) {
                    await api.reset_votemap_state();

                    const channel = await client.channels.fetch(channelID);
                    if (channel) {
                        await channel.send("Server below seeding threshold. Votemap state reset.");
                    }

                    await db.update(
                        { key: "lastMapReset" },
                        { $set: { timestamp: now, playerCount } },
                        { upsert: true }
                    );
                }
            }
        } catch (error) {
            console.error(`Error getting or setting votemap state:`, error);
            if (retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000;
                console.log(`Retrying in ${delay} ms... Attempt: ${retryCount + 1}`);
                setTimeout(() => makeCheck(retryCount + 1), delay);
            } else {
                alertAdmin(client, channelID, 'Failed to reset votemap state after multiple attempts.');
            }
        }
    };

    setInterval(makeCheck, updateInterval);
};

const alertAdmin = async (client, channelID, message) => {
    try {
        const channel = await client.channels.fetch(channelID);
        if (channel) {
            await channel.send(`ALERT: ${message}`);
        }
    } catch (error) {
        console.error('Failed to send admin alert:', error);
    }
};

module.exports = controlMapReset;
