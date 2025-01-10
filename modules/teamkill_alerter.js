const { logStreamManager } = require('./log_stream_manager');
const { EmbedBuilder } = require("discord.js");
const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Fetch player data from the database
const fetchPlayerData = async (pool, player_id) => {
    const result = await pool.query("SELECT * FROM teamkill_alerter WHERE player_id = $1", [player_id]);
    return result.rows[0];
};

// Save player data to the database
const savePlayerData = async (pool, playerData) => {
    const { player_id, playerName, totalTKs, timestamps, playersKilled } = playerData;
    const query = `
        INSERT INTO teamkill_alerter (player_id, playerName, totalTKs, timestamps, playersKilled)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (player_id)
        DO UPDATE SET 
            playerName = EXCLUDED.playerName,
            totalTKs = EXCLUDED.totalTKs,
            timestamps = EXCLUDED.timestamps,
            playersKilled = EXCLUDED.playersKilled;
    `;
    const values = [
        player_id,
        playerName,
        totalTKs,
        JSON.stringify(timestamps),
        JSON.stringify(playersKilled)
    ];
    await pool.query(query, values);
};

// Reset teamkill data at match end
const resetTKDataForNewMatch = async (pool) => {
    try {
        // Fetch the reset state from the database
        let resetState = await fetchPlayerData(pool, "resetState");
        if (!resetState) {
            resetState = { key: "resetState", value: { hasReset: false } };
        }

        // Reset teamkill data if it hasn't been reset yet
        if (!resetState.value.hasReset) {
            await pool.query("DELETE FROM teamkill_alerter");

            resetState.value.hasReset = true;
            await savePlayerData(pool, resetState);

            console.log("🧩", "Match ended. Teamkill data has been reset.");
        } else {
            console.log("🧩", "Teamkill data has already been reset for this match.");
        }
    } catch (error) {
        console.error("🧩 Error resetting teamkill data:", error);
    }
};

// Process teamkill data and send alerts
const processTeamkill = async (log, pool, config, client) => {
    const now = Date.now();
    const timeframe = config.timeframe * 60 * 1000;
    const alertAt = config.alertAt;
    const baseUrl = config.profile_url_prefix;

    const teamKillerName = log.player_name_1;
    const player_id = log.player_id_1;
    const victimName = log.player_name_2;

    let teamKillerProfile = await api.get_player_profile({ player_id: player_id });

    // Fetch or initialize player data
    let playerTKData = await fetchPlayerData(pool, player_id);
    if (!playerTKData) {
        playerTKData = {
            player_id,
            playerName: teamKillerName,
            totalTKs: 0,
            timestamps: [],
            playersKilled: []
        };
    }

    // Increment total teamkills
    playerTKData.totalTKs = (playerTKData.totalTKs || 0) + 1;

    // Add the current teamkill details
    playerTKData.timestamps.push(now);
    playerTKData.playersKilled.push(victimName);

    // Filter both `timestamps` and `playersKilled` for the configured timeframe
        const validEntries = playerTKData.timestamps.map((timestamp, index) => ({
            timestamp,
            victim: playerTKData.playersKilled[index]
        })).filter(entry => now - entry.timestamp <= timeframe);

        playerTKData.timestamps = validEntries.map(entry => entry.timestamp);
        playerTKData.playersKilled = validEntries.map(entry => entry.victim);

    // Check if teamkill threshold is exceeded
    if (playerTKData.timestamps.length >= alertAt) {
        const alertChannelID = config.channelID;
        const channel = await client.channels.fetch(alertChannelID);
        if (channel) {
            const embedAlert = new EmbedBuilder()
                .setTitle("Teamkill Alert")
                .setColor(0xff0000)
                .setDescription(
                    `**${playerTKData.playerName}** has committed ${playerTKData.timestamps.length} teamkills within the last ${config.timeframe} minutes!`
                )
                .addFields(
                    {
                        name: "Profile",
                        value: `[${playerTKData.playerName}](${baseUrl}${player_id})`,
                        inline: true,
                    },
                    {
                        name: "ID",
                        value: `${player_id}`,
                        inline: true,
                    },
                    {
                        name: "Killed",
                        value: `${playerTKData.playersKilled.join("\n")}`,
                        inline: true,
                    }
                );

            // Add penalty data if available
            if (teamKillerProfile.penalty_count) {
                embedAlert.addFields(
                    {
                        name: "Kicks",
                        value: `${teamKillerProfile.penalty_count["KICK"] || 0}`,
                        inline: true,
                    },
                    {
                        name: "Punishments",
                        value: `${teamKillerProfile.penalty_count["PUNISH"] || 0}`,
                        inline: true,
                    },
                    {
                        name: "Temp bans",
                        value: `${teamKillerProfile.penalty_count["TEMPBAN"] || 0}`,
                        inline: true,
                    }
                );
            }

            // Send the alert to the channel
            await channel.send({ embeds: [embedAlert] });
        }

        // Reset the data after sending the alert
        playerTKData.timestamps = [];
        playerTKData.playersKilled = [];
    }

    // Save the updated player data
    await savePlayerData(pool, playerTKData);
};

module.exports = (client, pool, config) => {
    // Subscribe to `TEAM KILL` action
    logStreamManager.subscribe("TEAM KILL");
    // Subscribe to `MATCH ENDED` action
    logStreamManager.subscribe("MATCH ENDED");

    logStreamManager.on("TEAM KILL", async (log) => {
        try {
            await processTeamkill(log, pool, config, client);
        } catch (error) {
            console.error("🧩 Error processing TEAM KILL log:", error);
        }
    });

    logStreamManager.on("MATCH ENDED", async () => {
        try {
            await resetTKDataForNewMatch(pool);
        } catch (error) {
            console.error("🧩 Error processing MATCH ENDED log:", error);
        }
    });
};