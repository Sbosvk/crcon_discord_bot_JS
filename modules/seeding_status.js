const API = require("crcon.js");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const RCON_API_URL = process.env.CRCON_API_URL;

const api = new API(RCON_API_URL, { token: CRCON_API_TOKEN });

const checkSeeds = async (client, db, config) => {
    const channelID = config.channelID;
    console.log(`Attempting to fetch channel with ID: ${channelID}`);

    client.once("ready", async () => {
        try {
            const channel = await client.channels.fetch(channelID);
            if (!channel) {
                console.error(`Channel with ID ${channelID} not found.`);
            } else {
                console.log(`Bot has access to channel: ${channel.name}`);
                console.log(
                    `Bot can send messages: ${channel
                        .permissionsFor(client.user)
                        .has(PermissionFlagsBits.SendMessages)}`
                );
                console.log(
                    `Bot can view channel: ${channel
                        .permissionsFor(client.user)
                        .has(PermissionFlagsBits.ViewChannel)}`
                );
            }
        } catch (error) {
            console.error(
                `Error fetching channel with ID ${channelID}:`,
                error
            );
        }
    });

    const updateInterval = config.updateInterval * 1000; // Convert to milliseconds
    let firstPlayer = null;

    async function monitorPlayerCounts() {
        try {
            // Check the database for the first player on every interval
            const dbFirstPlayer = await db.findOne({ key: "firstPlayer" });
            if (dbFirstPlayer) {
                firstPlayer = dbFirstPlayer.player;
            }

            const public_info = await api.public_info();
            const playerCount = public_info.result.player_count;
            const detailedPlayers = await api.get_detailed_players();
            const players = detailedPlayers.result.players;
            const playerKeys = Object.keys(players);

            if (playerCount > 0) {
                // Set the first player if not already set
                if (!firstPlayer && playerKeys.length > 0) {
                    firstPlayer = players[playerKeys[0]];
                    await db.update(
                        { key: "firstPlayer" },
                        { $set: { player: firstPlayer } },
                        { upsert: true }
                    );
                    console.log(`First player joined: ${firstPlayer.name}`);
                }

                // Current timestamp
                const now = Date.now();

                // Handle 3-10 players: Seeding message
                const seedingMessageStatus = await db.findOne({
                    key: "seedingMessageStatus",
                });
                if (playerCount >= 3 && playerCount < 10) {
                    if (
                        !seedingMessageStatus ||
                        now - seedingMessageStatus.timestamp > 30 * 60 * 1000
                    ) {
                        const channel = await client.channels.fetch(channelID);
                        if (channel) {
                            const playerNames = playerKeys.map(
                                (key) => players[key].name
                            );
                            const embed = new EmbedBuilder()
                                .setTitle("Seeding Started")
                                .setDescription(
                                    "Seeding has now been started! Players online:"
                                )
                                .addFields(
                                    playerNames
                                        .slice(0, 3)
                                        .map((name, index) => ({
                                            name: `Player ${index + 1}`,
                                            value: name,
                                            inline: true,
                                        }))
                                )
                                .setColor(0x00ff00);
                            await channel.send({ embeds: [embed] });

                            // Update timestamp for seeding message
                            await db.update(
                                { key: "seedingMessageStatus" },
                                { $set: { timestamp: now } },
                                { upsert: true }
                            );
                        }
                    }
                }

                // Handle 10+ players: Successful seed
                const seedMessageStatus = await db.findOne({
                    key: "seedMessageStatus",
                });
                if (playerCount >= 10 && dbFirstPlayer) {
                    let playerInfo = await api.player(firstPlayer.steam_id_64);
                    let playerAvatar =
                        playerInfo.result.steaminfo.profile.avatarfull;

                    if (!seedMessageStatus ||
                        now - seedMessageStatus.timestamp > 30 * 60 * 1000)
                        {
                        const channel = await client.channels.fetch(channelID);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setTitle("Successful Seed Started! :seedling:")
                                .setColor(0x00ff00);

                            if (firstPlayer && firstPlayer.name) {
                                embed.setDescription(
                                    `[**${firstPlayer.name}**](https://steamcommunity.com/profiles/${firstPlayer.steam_id_64}/) started a successful seed!\n` +
                                    `Total players: **${playerCount}**\n`
                                );
                                embed.setThumbnail(`${playerAvatar}`);
                            } else {
                                embed.setDescription(
                                    "Someone started a successful seed!"
                                );
                            }

                            // Fetch all current players and filter out firstPlayer
                            let fields = [];
                            playerKeys.forEach((key) => {
                                let player = players[key];
                                if (
                                    player.steam_id_64 !==
                                    firstPlayer.steam_id_64
                                ) {
                                    fields.push({
                                        name: player.name,
                                        value: "\u200B",
                                        inline: true,
                                    });
                                }
                            });

                            // Add fields to embed in rows of three
                            for (let i = 0; i < fields.length; i += 3) {
                                embed.addFields(fields.slice(i, i + 3));
                            }

                            await channel.send({ embeds: [embed] });

                            // Update timestamp for seed message
                            await db.update(
                                { key: "seedMessageStatus" },
                                { $set: { timestamp: now } },
                                { upsert: true }
                            );

                            // Reset the first player after a successful seed
                            firstPlayer = null;
                            await db.remove({ key: "firstPlayer" }, {});
                        }
                    } else {
                        console.log("Seed message already sent.");
                    }
                }

                // Handle 20 players: Encourage messages
                const encourage20MessageStatus = await db.findOne({
                    key: "encourage20MessageStatus",
                });
                if (playerCount === 20) {
                    if (
                        !encourage20MessageStatus ||
                        now - encourage20MessageStatus.timestamp >
                            30 * 60 * 1000
                    ) {
                        const channel = await client.channels.fetch(channelID);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setTitle("Half-way there!")
                            const message =
                                "20 players have joined! Come and join the fun!";
                            await channel.send(message);

                            // Update timestamp for encourage message
                            await db.update(
                                { key: "encourage20MessageStatus" },
                                { $set: { timestamp: now } },
                                { upsert: true }
                            );
                        }
                    }
                }

                // Handle 30 players: Encourage messages
                const encourage30MessageStatus = await db.findOne({
                    key: "encourage30MessageStatus",
                });
                if (playerCount === 30) {
                    if (
                        !encourage30MessageStatus ||
                        now - encourage30MessageStatus.timestamp >
                            30 * 60 * 1000
                    ) {
                        const channel = await client.channels.fetch(channelID);
                        if (channel) {
                            const message =
                                "30 players are in the game! The battle is heating up!";
                            await channel.send(message);

                            // Update timestamp for encourage message
                            await db.update(
                                { key: "encourage30MessageStatus" },
                                { $set: { timestamp: now } },
                                { upsert: true }
                            );
                        }
                    }
                }

                // Handle 35 players: Encourage messages
                const encourage35MessageStatus = await db.findOne({
                    key: "encourage35MessageStatus",
                });
                if (playerCount === 35) {
                    if (
                        !encourage35MessageStatus ||
                        now - encourage35MessageStatus.timestamp >
                            30 * 60 * 1000
                    ) {
                        const channel = await client.channels.fetch(channelID);
                        if (channel) {
                            const message =
                                "35 players online! Let's get this server full!";
                            await channel.send(message);

                            // Update timestamp for encourage message
                            await db.update(
                                { key: "encourage35MessageStatus" },
                                { $set: { timestamp: now } },
                                { upsert: true }
                            );
                        }
                    }
                }
            } else {
                // Reset the first player if there are no players
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
