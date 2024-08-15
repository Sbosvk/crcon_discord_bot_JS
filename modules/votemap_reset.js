// This module will assist you if you are using CRCON auto settings to set seeding maps, by resetting the votemap state once server is seeded.
const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const getSeedMaxPlayers = async () => {
    let response = await api.get_auto_mod_seeding_config()
    if (response.result) {
        const maxPlayers = response.result.enforce_cap_fight.max_players // Get seed number from enforce_cap_fight.max_players
        return maxPlayers;
    } else return false
} 

const controlMapReset = async (client, db, config) => {
    const updatinterval = parseInt(config.updatinterval) * 1000; //Convert to nanoseconds
    const channelID = config.channelID;

    const makeCheck = async () => {
        const public_info = await api.public_info();
        const playerCount = public_info.result.player_count;
        const seedCount  = await getSeedMaxPlayers();

        if (playerCount > seedCount) {
            await api.reset_votemap_state();

            const channel = await client.channels.fetch(channelID);
            if (channel) {
                await channel.send("Server seeded. Votemap state reset.")
            }
        }
    }
    setInterval(makeCheck, updatinterval);
}