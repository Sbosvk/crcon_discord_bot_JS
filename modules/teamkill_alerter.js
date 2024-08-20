const { Client, Intents, EmbedBuilder } = require('discord.js');
const API = require("crcon.js");
require('dotenv').config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

module.exports = (client, db, config) => {
    const webhookChannelID = config.webhookChannelID;
    const alertChannelID = config.channelID;
    const updateInterval = config.updateInterval * 1000;
    const alertAt = config.alertAt;
    const timeframe = config.timeframe * 60 * 1000;
    const baseUrl = config.profile_url_prefix;

    // Listen for messages in the webhook channel
    client.on('messageCreate', async message => {
        // console.log(`Message: ${JSON.stringify(message.embeds)}`)
        if (message.channelId === webhookChannelID && message.embeds.length > 0) {
            try {
                const now = Date.now();
                const embed = message.embeds[0];

                const fields = embed.fields;
                if (fields.length >= 3) {
                    const teamkillerField = fields[0].value;
                    const teamKillerMatch = teamkillerField.match(/\[(.*?)\]\(http:\/\/steamcommunity\.com\/profiles\/(\d+)\)/)

                    if (!teamKillerMatch) return;

                    const teamKillerName = teamKillerMatch[1];
                    const steamID = teamKillerMatch[2];

                    let teamKillerProfile = await api.player(steamID);

                    let tkFlagString = ""

                    if (teamKillerProfile) {
                        if (teamKillerProfile.flags && teamKillerProfile.flags.length > 0) {
                            teamKillerProfile.flags.forEach(flag => {
                                tkFlagString += flag["flag"];
                            })
                        }
                    }

                    let playerTKData = await db.findOne({ steamID });
                    if (!playerTKData) {
                        playerTKData = { steamID, playerName: teamKillerName, totalTKs: 0, timestamps: [] };
                    }

                    playerTKData.totalTKs += 1;
                    playerTKData.timestamps.push(now);

                    playerTKData.timestamps = playerTKData.timestamps.filter(
                        timestamp => now - timestamp <= timeframe
                    );

                    if (playerTKData.timestamps.length >= alertAt) {
                        const channel = await client.channels.fetch(alertChannelID);
                        if (channel) {
                            const embedAlert = new EmbedBuilder()
                                .setTitle('Teamkill Alert')
                                .setColor(0xff0000)
                                .setDescription(`**${playerTKData.playerName}** has committed ${playerTKData.timestamps.length} teamkills within the last ${config.timeframe} minutes!`)
                                .addFields(
                                    {
                                        name: "Profile",
                                        value: `[${playerTKData.playerName}](${baseUrl}${steamID})`,
                                        inline: true
                                    },
                                    {
                                        name: "Steam ID",
                                        value: `${steamID}`,
                                        inline: true
                                    },
                                    {
                                        name: "Total TKs",
                                        value: `${playerTKData.totalTKs}`,
                                        inline: true
                                    }
                                )
                                .addFields(
                                    {
                                        name: "Kicks",
                                        value: `${teamKillerProfile.penalty_count["KICK"]}`,
                                        inline: true
                                    },
                                    {
                                        name: "Punishments",
                                        value: `${teamKillerProfile.penalty_count["PUNISH"]}`,
                                        inline: true
                                    },
                                    {
                                        name: "Temp bans",
                                        value: `${teamKillerProfile.penalty_count["TEMPBAN"]}`,
                                        inline: true
                                    }
                                )
                                ;
                                console.log('"Message" sent..')
                            // await channel.send({ embeds: [embedAlert] });
                        }

                        playerTKData.timestamps = [];
                    }

                    await db.update({ steamID }, playerTKData, { upsert: true });
                }
            } catch (error) {
                console.error('Error processing teamkill webhook:', error);
            }
        }
    });

    // Monitor the public_info API to reset TK data at match end
    async function resetTKDataForNewMatch() {
        try {
            const publicInfo = await api.public_info();
            const timeRemaining = publicInfo.result.raw_time_remaining;
            const gameEnded = timeRemaining === "0:00:00";

            // Fetch or initialize the reset state
            let resetState = await db.findOne({ key: "resetState" });
            if (!resetState) {
                resetState = { key: "resetState", hasReset: false };
            }

            if (gameEnded && !resetState.hasReset) {
                // Reset teamkill data
                await db.remove({ steamID: { $exists: true } }, { multi: true });

                // Notify about reset
                const channel = await client.channels.fetch(alertChannelID);
                if (channel) {
                    await channel.send("Match ended. Teamkill data has been reset.");
                }

                // Mark as reset
                resetState.hasReset = true;
                await db.update({ key: "resetState" }, resetState, { upsert: true });
            } else if (!gameEnded && resetState.hasReset) {
                // Reset the state for the next match
                resetState.hasReset = false;
                await db.update({ key: "resetState" }, resetState, { upsert: true });
            }
        } catch (error) {
            console.error("Error resetting teamkill data:", error);
        }
    }

    setInterval(resetTKDataForNewMatch, updateInterval);
};

