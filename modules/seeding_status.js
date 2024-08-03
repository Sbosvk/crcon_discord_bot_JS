const API = require("crcon.js");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const RCON_API_URL = process.env.CRCON_API_URL;

const api = new API(RCON_API_URL, { token: CRCON_API_TOKEN });

const checkSeeds = async (client, db, config) => {
    const channelID = config.channelID;
    console.log(`Attempting to fetch channel with ID: ${channelID}`);

    client.once('ready', async () => {
        try {
            const channel = await client.channels.fetch(channelID);
            if (!channel) {
                console.error(`Channel with ID ${channelID} not found.`);
            } else {
                console.log(`Bot has access to channel: ${channel.name}`);
                console.log(`Bot can send messages: ${channel.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)}`);
                console.log(`Bot can view channel: ${channel.permissionsFor(client.user).has(PermissionFlagsBits.ViewChannel)}`);
            }
        } catch (error) {
            console.error(`Error fetching channel with ID ${channelID}:`, error);
        }
    });

    const updateInterval = config.updateInterval * 1000; // Convert to milliseconds
    let firstPlayer = null;

    async function monitorPlayerCounts() {
        try {
            const publicInfo = await api.publicInfo();
            const playerCount = publicInfo.result.player_count;
            const detailedPlayers = await api.getDetailedPlayers();
            const players = detailedPlayers.result.players;
            const playerKeys = Object.keys(players);

            if (playerCount > 0) {
                if (!firstPlayer) {
                    const dbFirstPlayer = await db.findOne({ key: "firstPlayer" });
                    if (dbFirstPlayer) {
                        firstPlayer = dbFirstPlayer.player;
                    }
                    if (!firstPlayer && playerKeys.length > 0) {
                        firstPlayer = players[playerKeys[0]];
                        await db.update({ key: "firstPlayer" }, { $set: { player: firstPlayer } }, { upsert: true });
                        console.log(`First player joined: ${firstPlayer.name}`);
                    }
                }

                if (playerCount >= 3 && playerCount < 10) {
                    const channel = await client.channels.fetch(channelID);
                    if (channel) {
                        const playerNames = playerKeys.map((key) => players[key].name);
                        const embed = new EmbedBuilder()
                            .setTitle("Seeding Started")
                            .setDescription("Seeding has now been started! Players online:")
                            .addFields(
                                playerNames.slice(0, 3).map((name, index) => ({ name: `Player ${index + 1}`, value: name, inline: true }))
                            )
                            .setColor(0x00ff00);
                        await channel.send({ embeds: [embed] });
                    }
                }

                if (playerCount >= 10 && firstPlayer) {
                    const channel = await client.channels.fetch(channelID);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setTitle("Successful Seed Started")
                            .setDescription(`**${firstPlayer.name}** started a successful seed!`)
                            .setThumbnail(`https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/${firstPlayer.steam_id_64.slice(0, 2)}/${firstPlayer.steam_id_64}.jpg`)
                            .setColor(0x00ff00);
                        await channel.send({ embeds: [embed] });

                        firstPlayer = null;
                        await db.remove({ key: "firstPlayer" }, {});
                    }
                }

                if (playerCount === 20 || playerCount === 30 || playerCount === 35) {
                    const channel = await client.channels.fetch(channelID);
                    if (channel) {
                        const messages = {
                            20: "20 players have joined! Come and join the fun!",
                            30: "30 players are in the game! The battle is heating up!",
                            35: "35 players online! Let's get this server full!",
                        };
                        await channel.send(messages[playerCount]);
                    }
                }
            } else {
                firstPlayer = null;
                await db.remove({ key: "firstPlayer" }, {});
            }
        } catch (error) {
            console.error("Error monitoring player counts:", error);
        }
    }

    setInterval(monitorPlayerCounts, updateInterval);
};

module.exports = checkSeeds;
