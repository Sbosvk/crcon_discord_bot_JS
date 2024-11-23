const { EmbedBuilder } = require("discord.js");
const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Initialize the PostgreSQL table for teamkill alerts
const initializeTable = async (pool) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS teamkill_alerter (
            steamID TEXT PRIMARY KEY,
            playerName TEXT,
            totalTKs INTEGER DEFAULT 0,
            timestamps JSONB DEFAULT '[]'
        );
    `;
    await pool.query(createTableQuery);
};

// Fetch player data from the database
const fetchPlayerData = async (pool, steamID) => {
    const result = await pool.query("SELECT * FROM teamkill_alerter WHERE steamID = $1", [steamID]);
    return result.rows[0];
};

// Save player data to the database
const savePlayerData = async (pool, playerData) => {
    const { steamID, playerName, totalTKs, timestamps } = playerData;
    const query = `
        INSERT INTO teamkill_alerter (steamID, playerName, totalTKs, timestamps)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (steamID)
        DO UPDATE SET 
            playerName = EXCLUDED.playerName,
            totalTKs = EXCLUDED.totalTKs,
            timestamps = EXCLUDED.timestamps;
    `;
    const values = [steamID, playerName, totalTKs, JSON.stringify(timestamps)];
    await pool.query(query, values);
};

// Process teamkill data and send alerts
const processTeamkill = async (teamKillerName, steamID, pool, config, client) => {
    const now = Date.now();
    const timeframe = config.timeframe * 60 * 1000;
    const alertAt = config.alertAt;
    const baseUrl = config.profile_url_prefix;

    let teamKillerProfile = await api.get_player_profile(steamID);

    let playerTKData = await fetchPlayerData(pool, steamID);
    if (!playerTKData) {
        playerTKData = {
            steamID,
            playerName: teamKillerName,
            totalTKs: 0,
            timestamps: [],
        };
    }

    playerTKData.totalTKs += 1;
    playerTKData.timestamps.push(now);

    playerTKData.timestamps = playerTKData.timestamps.filter(
        (timestamp) => now - timestamp <= timeframe
    );

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
                        value: `[${playerTKData.playerName}](${baseUrl}${steamID})`,
                        inline: true,
                    },
                    {
                        name: "Steam ID",
                        value: `${steamID}`,
                        inline: true,
                    },
                    {
                        name: "Total TKs",
                        value: `${playerTKData.totalTKs}`,
                        inline: true,
                    }
                );

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
            await channel.send({ embeds: [embedAlert] });
        }

        playerTKData.timestamps = [];
    }

    await savePlayerData(pool, playerTKData);
};

// Handle native webhook
const nativeWebhook = (data, config, pool, client) => {
    console.log("teamkill_alerter", "Processing native webhook data");
    const teamKillerName = data.player.name;
    const steamID = data.player.id;

    processTeamkill(teamKillerName, steamID, pool, config, client);
};

// Handle Discord webhook
const discordModule = (client, pool, config) => {
    const webhookChannelID = config.webhookChannelID;

    client.on("messageCreate", async (message) => {
        if (message.channelId === webhookChannelID && message.embeds.length > 0) {
            try {
                const embed = message.embeds[0];
                const fields = embed.fields;
                if (fields.length >= 3) {
                    const teamkillerField = fields[0].value;
                    const teamKillerMatch = teamkillerField.match(
                        /\[(.*?)\]\(http:\/\/steamcommunity\.com\/profiles\/(\d+)\)/
                    );

                    if (!teamKillerMatch) return;

                    const teamKillerName = teamKillerMatch[1];
                    const steamID = teamKillerMatch[2];

                    await processTeamkill(teamKillerName, steamID, pool, config, client);
                }
            } catch (error) {
                console.error("Error processing teamkill webhook:", error);
            }
        }
    });

    // Reset teamkill data at match end
    const resetTKDataForNewMatch = async () => {
        try {
            const publicInfo = await api.get_public_info();
            const timeRemaining = publicInfo.result.raw_time_remaining;
            const gameEnded = timeRemaining === "0:00:00";

            let resetState = await fetchPlayerData(pool, "resetState");
            if (!resetState) {
                resetState = { key: "resetState", value: { hasReset: false } };
            }

            if (gameEnded && !resetState.value.hasReset) {
                await pool.query("DELETE FROM teamkill_alerter WHERE steamID IS NOT NULL");

                resetState.value.hasReset = true;
                await savePlayerData(pool, resetState);
                console.log("Match ended. Teamkill data has been reset.");
            } else if (!gameEnded && resetState.value.hasReset) {
                resetState.value.hasReset = false;
                await savePlayerData(pool, resetState);
            }
        } catch (error) {
            console.error("Error resetting teamkill data:", error);
        }
    };

    setInterval(resetTKDataForNewMatch, config.updateInterval * 1000);
};

module.exports = async (client, pool, config) => {
    await initializeTable(pool);

    if (config.webhook) {
        console.log("teamkill_alerter", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, pool, client),
        };
    } else {
        console.log("teamkill_alerter", "Using Discord mode.");
        return discordModule(client, pool, config);
    }
};
