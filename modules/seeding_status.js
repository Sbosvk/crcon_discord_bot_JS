const API = require("crcon.js");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const checkSeeds = async (client, db, config) => {
    const channelID = config.channelID;
    const mentions = config.mentions || []; // Get mentions from the config

    const updateInterval = config.updateInterval * 1000; // Convert to milliseconds
    let firstPlayer = null;

    const triggerSteps = config.triggerSteps || 5; // Configurable number of triggers, default to 5

    async function monitorPlayerCounts() {
        try {
            const public_info = await api.get_public_info();
            const playerCount = public_info.result.player_count;

            const seedConfig = await api.get_auto_mod_seeding_config();
            const maxPlayers = seedConfig.result.enforce_cap_fight.max_players;

            // Calculate trigger points based on maxPlayers
            const triggerPoints = calculateTriggerPoints(maxPlayers, triggerSteps);

            // Fetch and store player count history
            const now = Date.now();
            await db.update(
                { key: "playerCounts" },
                { $push: { counts: { timestamp: now, count: playerCount } } },
                { upsert: true }
            );
            const playerCounts = await db.findOne({ key: "playerCounts" });
            if (playerCounts && playerCounts.counts.length > 10) {
                await db.update(
                    { key: "playerCounts" },
                    { $set: { counts: playerCounts.counts.slice(-10) } }
                );
            }

            const trend = calculateTrend(playerCounts.counts);

            if (playerCount > 0) {
                const dbFirstPlayer = await db.findOne({ key: "firstPlayer" });
                if (dbFirstPlayer) {
                    firstPlayer = dbFirstPlayer.player;
                }

                // Check if we need to announce the first player
                await announceFirstPlayer(client, db, config, playerCount, trend, firstPlayer, maxPlayers);

                // Monitor seeding status based on calculated trigger points
                await handlePlayerTriggers(triggerPoints, playerCount, trend, client, db, channelID, mentions);
            } else {
                firstPlayer = null;
                await db.remove({ key: "firstPlayer" });
            }
        } catch (error) {
            console.error("Error monitoring player counts:", error);
        }
    }

    setInterval(monitorPlayerCounts, updateInterval);
};

// Calculate trigger points based on maxPlayers and the number of steps
function calculateTriggerPoints(maxPlayers, steps) {
    let triggerPoints = [];
    const stepSize = Math.floor(maxPlayers / steps);
    for (let i = 1; i <= steps; i++) {
        triggerPoints.push(stepSize * i);
    }
    return triggerPoints;
}

// Announce the first player when we reach a certain milestone
async function announceFirstPlayer(client, db, config, playerCount, trend, firstPlayer, maxPlayers) {
    const channelID = config.channelID;
    if (firstPlayer && playerCount >= Math.ceil(maxPlayers / 3) && trend === "up") {
        const firstPlayerAnnounced = await db.findOne({ key: "firstPlayerAnnounced" });

        if (!firstPlayerAnnounced) {
            const channel = await client.channels.fetch(channelID);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle("Seed Underway! 🌱")
                    .setColor(0x00ff00)
                    .setDescription(
                        `Player [**${firstPlayer.name}**](https://steamcommunity.com/profiles/${firstPlayer.steam_id_64}/) was the first to join and helped start a successful seed!`
                    )
                    .setImage(firstPlayer.avatarfull || null)
                    .setFooter({ text: `Thanks for helping seed the server!` });

                await channel.send({ embeds: [embed] });
                console.log("Seeding Status", `First player ${firstPlayer.name} announced.`);
            }

            await db.update(
                { key: "firstPlayerAnnounced" },
                { $set: { announced: true } },
                { upsert: true }
            );
        }
    }
}

// Handle seeding messages for player count triggers
async function handlePlayerTriggers(triggerPoints, playerCount, trend, client, db, channelID, mentions) {
    const now = Date.now();
    for (let trigger of triggerPoints) {
        const triggerKey = `trigger${trigger}`;
        const triggerStatus = await db.findOne({ key: triggerKey });

        if (playerCount >= trigger && trend === "up") {
            if (!triggerStatus || now - triggerStatus.timestamp > 5 * 60 * 1000) {
                await sendTriggerMessage(channelID, playerCount, trigger, client, mentions);
                await db.update(
                    { key: triggerKey },
                    { $set: { timestamp: now } },
                    { upsert: true }
                );
            }
        }
    }
}

async function sendTriggerMessage(channelID, playerCount, trigger, client, mentions) {
    const channel = await client.channels.fetch(channelID);
    if (channel) {
        const embed = new EmbedBuilder()
            .setTitle(`Seed Milestone Reached! :seedling:`)
            .setDescription(`Player count has reached **${playerCount}**! Milestone: **${trigger} players**`)
            .setColor(0x00ff00);

        let content = mentions.map(role => `<@&${role}>`).join(" ");
        await channel.send({ content, embeds: [embed] });
    }
}

function calculateTrend(counts) {
    if (counts.length < 2) return "stable";
    const changes = counts.slice(1).map((point, index) => point.count - counts[index].count);
    const increasing = changes.filter(change => change > 0).length;
    const decreasing = changes.filter(change => change < 0).length;

    const recentChanges = changes.slice(-3);
    const recentMagnitude = recentChanges.reduce((acc, change) => acc + Math.abs(change), 0);

    if (increasing > decreasing && recentMagnitude > 1) return "up";
    if (decreasing > increasing && recentMagnitude > 1) return "down";
    return "stable";
}

module.exports = checkSeeds;
