const API = require("crcon.js");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const checkSeeds = async (client, db, config) => {
    const channelID = config.channelID;
    const mentions = config.mentions || []; // Get mentions from the config
    console.log(`Attempting to fetch channel with ID: ${channelID}`);

    client.once("ready", async () => {
        try {
            const channel = await client.channels.fetch(channelID);
            if (!channel) {
                console.error(`Channel with ID ${channelID} not found.`);
            } else {
                console.log(`Bot has access to channel: ${channel.name}`);
            }
        } catch (error) {
            console.error(`Error fetching channel with ID ${channelID}:`, error);
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

            const public_info = await api.get_public_info();
            const playerCount = public_info.result.player_count;
            const detailedPlayers = await api.get_detailed_players();
            const players = detailedPlayers.result.players;
            const playerKeys = Object.keys(players);

            // Store the current player count with a timestamp
            const now = Date.now();
            await db.update(
                { key: "playerCounts" },
                { $push: { counts: { timestamp: now, count: playerCount } } },
                { upsert: true }
            );

            // Keep only the last 10 data points
            const playerCounts = await db.findOne({ key: "playerCounts" });
            if (playerCounts && playerCounts.counts.length > 10) {
                await db.update(
                    { key: "playerCounts" },
                    { $set: { counts: playerCounts.counts.slice(-10) } }
                );
            }

            // Calculate trend
            const trend = calculateTrend(playerCounts.counts);

            if (playerCount > 0) {
                if (!firstPlayer && playerKeys.length > 0) {
                    firstPlayer = players[playerKeys[0]];
                    await db.update(
                        { key: "firstPlayer" },
                        { $set: { player: firstPlayer } },
                        { upsert: true }
                    );
                    console.log(`First player joined: ${firstPlayer.name}`);
                }

                // Seeding message for 3-10 players
                const seedingMessageStatus = await db.findOne({ key: "seedingMessageStatus" });
                if (playerCount >= 3 && playerCount < 10 && trend === "up") {
                    if (!seedingMessageStatus || now - seedingMessageStatus.timestamp > 5 * 60 * 1000) {
                        await sendSeedingMessage(channelID, playerKeys, players, client, db, mentions);
                    }
                }

                // Successful seed message for 10+ players
                const seedMessageStatus = await db.findOne({ key: "seedMessageStatus" });
                if (playerCount >= 10 && dbFirstPlayer && trend === "up") {
                    let playerInfo = await api.get_player_profile(firstPlayer.steam_id_64);
                    let playerAvatar = playerInfo.result.steaminfo.profile.avatarfull;

                    if (!seedMessageStatus || now - seedMessageStatus.timestamp > 5 * 60 * 1000) {
                        await sendSeedSuccessMessage(channelID, playerCount, firstPlayer, playerAvatar, playerKeys, players, client, db, mentions);
                    } else {
                        console.log("Seed message already sent.");
                    }
                }

                // Encourage messages
                await handleEncourageMessages(playerCount, channelID, client, db);
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

function calculateTrend(counts) {
    if (counts.length < 2) return "stable";
    const changes = counts.slice(1).map((point, index) => point.count - counts[index].count);
    const increasing = changes.filter(change => change > 0).length;
    const decreasing = changes.filter(change => change < 0).length;

    // Calculate the recent magnitude of changes
    const recentChanges = changes.slice(-3); // Last 3 changes
    const recentMagnitude = recentChanges.reduce((acc, change) => acc + Math.abs(change), 0);

    if (increasing > decreasing && recentMagnitude > 5) return "up";
    if (decreasing > increasing && recentMagnitude > 5) return "down";
    return "stable";
}

async function sendSeedingMessage(channelID, playerKeys, players, client, db, mentions) {
    const channel = await client.channels.fetch(channelID);
    if (channel) {
        const playerNames = playerKeys.map(key => players[key].name);
        const embed = new EmbedBuilder()
            .setTitle("Someone started a seed! :seedling:")
            .setDescription("Seeding has now been started! \nJoin the seed!\n:three: players online:")
            .addFields(playerNames.slice(0, 3).map((name, index) => ({
                name: `Player ${index + 1}`,
                value: name,
                inline: true,
            })))
            .setColor(0x00ff00);

        let content = mentions.map(role => `<@&${role}>`).join(" ");

        await channel.send({ content, embeds: [embed] });

        const now = Date.now();
        await db.update(
            { key: "seedingMessageStatus" },
            { $set: { timestamp: now } },
            { upsert: true }
        );
    }
}

async function sendSeedSuccessMessage(channelID, playerCount, firstPlayer, playerAvatar, playerKeys, players, client, db, mentions) {
    const channel = await client.channels.fetch(channelID);
    if (channel) {
        const embed = new EmbedBuilder()
            .setTitle("Successful Seed Started! :seedling:")
            .setColor(0x00ff00)
            .setDescription(`[**${firstPlayer.name}**](https://steamcommunity.com/profiles/${firstPlayer.steam_id_64}/) ` +
                `**started a successful seed!**\n` +
                `Total players: **${playerCount}**\n`
            )
            .setImage(`${playerAvatar}`)

        let fields = [];
        playerKeys.forEach(key => {
            let player = players[key];
            if (player.steam_id_64 !== firstPlayer.steam_id_64) {
                fields.push({ name: player.name, value: "\u200B", inline: true });
            }
        });

        for (let i = 0; i < fields.length; i += 3) {
            embed.addFields(fields.slice(i, i + 3));
        }

        let content = mentions.map(role => `<@&${role}>`).join(" ");

        await channel.send({ content, embeds: [embed] });

        const now = Date.now();
        await db.update(
            { key: "seedMessageStatus" },
            { $set: { timestamp: now } },
            { upsert: true }
        );
    }
}

async function handleEncourageMessages(playerCount, channelID, client, db) {
    const now = Date.now();
    const encourage20MessageStatus = await db.findOne({ key: "encourage20MessageStatus" });
    const encourage30MessageStatus = await db.findOne({ key: "encourage30MessageStatus" });
    const encourage35MessageStatus = await db.findOne({ key: "encourage35MessageStatus" });

    const messages = {
        20: "**:two: :zero: players have joined!**\nCome and join the fun!",
        30: ":three: :zero: **players are in the game!** \nThe battle is heating up! :fire:",
        35: ":three: :five: **players online!** \nAlmost seeded! :pleading_face: ",
    };

    const messageKeys = [20, 30, 35];
    for (let key of messageKeys) {
        if (playerCount === key) {
            const statusKey = `encourage${key}MessageStatus`;
            const encourageMessageStatus = await db.findOne({ key: statusKey });
            if (!encourageMessageStatus || now - encourageMessageStatus.timestamp > 5 * 60 * 1000) {
                const channel = await client.channels.fetch(channelID);
                if (channel) {
                    await channel.send(messages[key]);
                    await db.update(
                        { key: statusKey },
                        { $set: { timestamp: now } },
                        { upsert: true }
                    );
                }
            }
        }
    }
}

module.exports = checkSeeds;
