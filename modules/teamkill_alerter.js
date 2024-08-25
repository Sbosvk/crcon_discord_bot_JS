const { Client, Intents, EmbedBuilder } = require("discord.js");
const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const processTeamkill = async (teamKillerName, steamID, db, config) => {
    const now = Date.now();
    const timeframe = config.timeframe * 60 * 1000;
    const alertAt = config.alertAt;
    const baseUrl = config.profile_url_prefix;

    let teamKillerProfile = await api.get_player_profile(steamID);

    let playerTKData = await db.findOne({ steamID });
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

            // Check if penalty_count is defined before accessing it
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

    await db.update({ steamID }, playerTKData, {
        upsert: true,
    });
};

const nativeWebhook = (data, config, db) => {
    console.log("teamkill_alerter", "Processing native webhook data:", data);
    const teamKillerName = data.player.name;
    const steamID = data.player.id;

    processTeamkill(teamKillerName, steamID, db, config);
};

const discordModule = (client, db, config) => {
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

                    await processTeamkill(teamKillerName, steamID, db, config);
                }
            } catch (error) {
                console.error("Error processing teamkill webhook:", error);
            }
        }
    });

    // Monitor the public_info API to reset TK data at match end
    async function resetTKDataForNewMatch() {
        try {
            const publicInfo = await api.get_public_info();
            const timeRemaining = publicInfo.result.raw_time_remaining;
            const gameEnded = timeRemaining === "0:00:00";

            let resetState = await db.findOne({ key: "resetState" });
            if (!resetState) {
                resetState = { key: "resetState", hasReset: false };
            }

            if (gameEnded && !resetState.hasReset) {
                await db.remove(
                    { steamID: { $exists: true } },
                    { multi: true }
                );

                resetState.hasReset = true;
                await db.update({ key: "resetState" }, resetState, { upsert: true });
                console.log("Match ended. Teamkill data has been reset.");
            } else if (!gameEnded && resetState.hasReset) {
                resetState.hasReset = false;
                await db.update({ key: "resetState" }, resetState, {
                    upsert: true,
                });
            }
        } catch (error) {
            console.error("Error resetting teamkill data:", error);
        }
    }

    setInterval(resetTKDataForNewMatch, config.updateInterval * 1000);
};

module.exports = (client, db, config) => {
    if (config.webhook) {
        console.log("teamkill_alerter", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, db),
        };
    } else {
        console.log("teamkill_alerter", "Using Discord mode.");
        return discordModule(client, db, config);
    }
};
