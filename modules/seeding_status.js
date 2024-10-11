const API = require("crcon.js");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const checkSeeds = async (client, db, config) => {
    const channelID = config.channelID;
    const mentions = config.mentions || [];
    const updateInterval = config.updateInterval * 1000;
    const triggerSteps = config.triggerSteps || 5;
    const debounceMinutes = config.debounceMinutes || 5;

    let stopAfterMax = false; // Control flag to stop after reaching max players

    async function monitorPlayerCounts() {
        try {
            const public_info = await api.get_public_info();
            const playerCount = public_info.result.player_count;

            const seedConfig = await api.get_auto_mod_seeding_config();
            const maxPlayers = seedConfig.result.enforce_cap_fight.max_players;

            if (playerCount >= maxPlayers) {
                stopAfterMax = true; // Stop sending messages after reaching max players
            }

            if (!stopAfterMax) {
                const triggerPoints = calculateTriggerPoints(maxPlayers, triggerSteps);

                // Store player count history
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
                    // Handle first player assignment if not already done
                    let dbFirstPlayer = await db.findOne({ key: "firstPlayer" });
                    if (!dbFirstPlayer) {
                        const detailedPlayers = await api.get_detailed_players();
                        const players = detailedPlayers.result.players;
                        const firstPlayerKey = Object.keys(players)[0];
                        const firstPlayer = players[firstPlayerKey];
                        
                        if (firstPlayer) {
                            await db.update(
                                { key: "firstPlayer" },
                                { $set: { player: firstPlayer } },
                                { upsert: true }
                            );
                            dbFirstPlayer = { player: firstPlayer };
                        }
                    }

                    // Announce first player
                    await announceFirstPlayer(client, db, config, playerCount, trend, dbFirstPlayer.player, maxPlayers);

                    // Monitor seeding status and trigger messages
                    await handlePlayerTriggers(triggerPoints, playerCount, trend, client, db, channelID, mentions);
                } else {
                    await db.remove({ key: "firstPlayer" });
                }
            } else {
                // Send final seeding success message when fully seeded
                await checkFullSeed(maxPlayers, playerCount, trend, client, db, channelID, mentions);
            }
        } catch (error) {
            console.error("Error monitoring player counts:", error);
        }
    }

    setInterval(monitorPlayerCounts, updateInterval);
};

// Randomized word lists
const greetings = [
    "Hooray", 
    "Congratulations", 
    "Well done", 
    "Fantastic", 
    "Great job", 
    "Awesome", 
    "Way to go", 
    "Keep it up", 
    "Impressive", 
    "You did it"
];

const milestones = [
    "Player count has reached **{playerCount}**!", 
    "We’ve hit **{playerCount}** players!", 
    "**{playerCount}** players have joined!", 
    "We now have **{playerCount}** players!", 
    "Wow, **{playerCount}** players are online!", 
    "Look at that, **{playerCount}** players are here!", 
    "**{playerCount}** players seeding the server!", 
    "**{playerCount}** players and climbing!", 
    "We've reached **{playerCount}** players!", 
    "**{playerCount}** seeding heroes!"
];

const closings = [
    "Let's keep it going!", 
    "Thanks for seeding!", 
    "Keep up the great work!", 
    "Let’s aim for the next milestone!", 
    "Thanks for joining the seed!", 
    "We’re getting there!", 
    "The server is filling up fast!", 
    "Invite your friends and let's keep growing!", 
    "The seed is on fire!", 
    "Let's reach the next level!"
];

// Function to randomize the message elements
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Calculate trigger points based on maxPlayers and steps
function calculateTriggerPoints(maxPlayers, steps) {
    let triggerPoints = [];
    const stepSize = Math.floor(maxPlayers / steps);
    for (let i = 1; i <= steps; i++) {
        triggerPoints.push(stepSize * i);
    }
    return triggerPoints;
}

// Announce the first player when the seed reaches a certain point
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
async function handlePlayerTriggers(triggerPoints, playerCount, trend, client, db, channelID, mentions, debounceMinutes) {
    const now = Date.now();
    let debounceTime = debounceMinutes * 60 * 1000; // Convert to milliseconds
    for (let trigger of triggerPoints) {
        const triggerKey = `trigger${trigger}`;
        const triggerStatus = await db.findOne({ key: triggerKey });

        if (playerCount >= trigger && trend === "up") {
            if (!triggerStatus || now - triggerStatus.timestamp > debounceTime) {
                await sendTriggerMessage(channelID, playerCount, trigger, client, mentions);
                await db.update(
                    { key: triggerKey },
                    { $set: { timestamp: now } },
                    { upsert: true }
                );
                break; // Exit after sending the message for the current trigger
            }
        }
    }
}

// Send a message for each trigger point with randomized content
async function sendTriggerMessage(channelID, playerCount, trigger, client, mentions) {
    const channel = await client.channels.fetch(channelID);
    if (channel) {
        const greeting = randomElement(greetings);
        const milestone = randomElement(milestones).replace("{playerCount}", playerCount);
        const closing = randomElement(closings);

        const embed = new EmbedBuilder()
            .setTitle(`${greeting}! 🌱`)
            .setDescription(`${milestone}\n${closing}`)
            .setColor(0x00ff00);

        let content = mentions.map(role => `<@&${role}>`).join(" ");
        await channel.send({ content, embeds: [embed] });
    }
}

// Stop after full seeding
async function checkFullSeed(maxPlayers, playerCount, trend, client, db, channelID, mentions) {
    const fullySeeded = await db.findOne({ key: "fullySeeded" });

    if (playerCount >= maxPlayers && trend === "up" && (!fullySeeded || !fullySeeded.announced)) {
        const channel = await client.channels.fetch(channelID);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle("🎉 Fully Seeded! 🎉")
                .setColor(0x00ff00)
                .setDescription(`The server is now fully seeded with **${playerCount} players**! Thanks for helping out!`);

            let content = mentions.map(role => `<@&${role}>`).join(" ");
            await channel.send({ content, embeds: [embed] });
        }

        await db.update(
            { key: "fullySeeded" },
            { $set: { announced: true } },
            { upsert: true }
        );
    }
}

// Calculate trend
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
