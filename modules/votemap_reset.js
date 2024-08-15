const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const getSeedMaxPlayers = async () => {
    try {
        const response = await api.get_auto_mod_seeding_config();
        if (response.result) {
            return response.result.enforce_cap_fight.max_players;
        } else {
            console.error('Failed to retrieve seeding config:', response);
            return false;
        }
    } catch (error) {
        console.error('Error fetching seeding configuration:', error);
        return false;
    }
};

const controlMapReset = async (client, db, config) => {
    const updateInterval = parseInt(config.updateInterval) * 1000; // Convert to milliseconds
    const channelID = config.channelID;

    async function makeCheck(retryCount = 0) {
        try {
            const public_info = await api.public_info();
            const playerCount = public_info.result.player_count;
            const maxPlayers = await getSeedMaxPlayers();

            if (maxPlayers && playerCount > maxPlayers) {
                await api.reset_votemap_state();

                const channel = await client.channels.fetch(channelID);
                if (channel) {
                    await channel.send("Server seeded. Votemap state reset.");
                }
            }
        } catch (error) {
            console.error(`Error getting or setting votemap state:`, error);
            if (retryCount < 3) {
                console.log('Retrying... Attempt:', retryCount + 1);
                await makeCheck(retryCount + 1);
            }
        }
    }

    setInterval(makeCheck, updateInterval);
};

module.exports = controlMapReset;
