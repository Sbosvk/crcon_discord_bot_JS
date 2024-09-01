const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const controlMapReset = async (client, db, config) => {
    const updateInterval = parseInt(config.updateInterval) * 1000; // Convert to milliseconds
    const channelID = config.channelID;
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes cooldown

    const makeCheck = async (retryCount = 0) => {
        try {
            let public_info = await api.get_public_info();
            public_info = public_info.result;
            const playerCount = public_info.player_count;
            const seedConfig = await api.get_auto_mod_seeding_config();
            const maxPlayers = seedConfig.result.enforce_cap_fight.max_players;
            const lastReset = await db.findOne({ key: "lastMapReset" });
            const now = Date.now();

            const lastResetAboveMax = lastReset && lastReset.playerCount > maxPlayers;
            const currentAboveMax = playerCount > maxPlayers;

            if (lastReset) {
                // Check if the last reset condition is different from the current condition
                if (lastResetAboveMax !== currentAboveMax && (now - lastReset.timestamp > cooldownPeriod)) {
                    await api.reset_votemap_state()
                        .then(async () => {
                            await db.update(
                                { key: "lastMapReset" },
                                { $set: { timestamp: now, playerCount } },
                                { upsert: true }
                            )
                            .then(() => { 
                                console.log(`votemap_reset: Votemap state reset due to player count change. Current player count: ${playerCount}`); 
                            })
                        }).catch(err => console.log("Could not update db: ", err))
                }
            } else {
                // If no previous reset, perform the first reset
                await api.reset_votemap_state()
                    .then(async () => {
                        await db.update(
                            { key: "lastMapReset" },
                            { $set: { timestamp: now, playerCount } },
                            { upsert: true }
                        )
                        .then(() => { 
                            console.log(`votemap_reset: Initial votemap state reset. Current player count: ${playerCount}`); 
                        })
                    }).catch(err => console.log("Could not update db: ", err))
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
