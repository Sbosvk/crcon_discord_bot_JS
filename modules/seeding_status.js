const API = require("crcon.js");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Initialize the PostgreSQL table for seeding status
const initializeTable = async (pool) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS seeding_status (
            key TEXT PRIMARY KEY,
            value JSONB
        );
    `;
    await pool.query(createTableQuery);
};

// Fetch a key-value pair from the database
const getKeyValue = async (pool, key) => {
    const result = await pool.query("SELECT value FROM seeding_status WHERE key = $1", [key]);
    return result.rows[0]?.value || null;
};

// Update or insert a key-value pair in the database
const setKeyValue = async (pool, key, value) => {
    const query = `
        INSERT INTO seeding_status (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value;
    `;
    await pool.query(query, [key, value]);
};

// Remove a key-value pair from the database
const removeKey = async (pool, key) => {
    await pool.query("DELETE FROM seeding_status WHERE key = $1", [key]);
};

// Main function to monitor player counts and manage seeding
const checkSeeds = async (client, pool, config) => {
    const channelID = config.channelID;
    const mentions = config.mentions || [];
    const updateInterval = config.updateInterval * 1000;
    const triggerSteps = config.triggerSteps || 5;
    const debounceMinutes = config.debounceMinutes || 5;

    let stopAfterMax = false; // Control flag to stop after reaching max players

    const monitorPlayerCounts = async () => {
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

                const now = Date.now();
                let playerCounts = await getKeyValue(pool, "playerCounts");
                if (!playerCounts) playerCounts = { counts: [] };

                playerCounts.counts.push({ timestamp: now, count: playerCount });
                if (playerCounts.counts.length > 10) {
                    playerCounts.counts = playerCounts.counts.slice(-10);
                }
                await setKeyValue(pool, "playerCounts", playerCounts);

                let trend = "stable";
                if (playerCounts.counts.length >= 2) {
                    trend = calculateTrend(playerCounts.counts);
                }

                if (playerCount > 0) {
                    let dbFirstPlayer = await getKeyValue(pool, "firstPlayer");
                    if (!dbFirstPlayer) {
                        const detailedPlayers = await api.get_detailed_players();
                        const players = detailedPlayers.result.players;
                        const firstPlayerKey = Object.keys(players)[0];
                        const firstPlayer = players[firstPlayerKey];

                        if (firstPlayer) {
                            await setKeyValue(pool, "firstPlayer", { player: firstPlayer });
                            dbFirstPlayer = { player: firstPlayer };
                        }
                    }

                    await announceFirstPlayer(client, pool, config, playerCount, trend, dbFirstPlayer?.player, maxPlayers);
                    await handlePlayerTriggers(triggerPoints, playerCount, trend, client, pool, channelID, mentions, debounceMinutes);
                } else {
                    await removeKey(pool, "firstPlayer");
                }
            } else {
                await checkFullSeed(maxPlayers, playerCount, {}, client, pool, channelID, mentions);
            }
        } catch (error) {
            console.error("🧩", "Error monitoring player counts", error);
        }
    };

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
const calculateTriggerPoints = (maxPlayers, steps) => {
    const stepSize = Math.floor(maxPlayers / steps);
    return Array.from({ length: steps }, (_, i) => stepSize * (i + 1));
};

// Announce the first player when the seed reaches a certain point
const announceFirstPlayer = async (client, pool, config, playerCount, trend, firstPlayer, maxPlayers) => {
    const channelID = config.channelID;
    if (firstPlayer && playerCount >= Math.ceil(maxPlayers / 3) && trend === "up") {
        const firstPlayerAnnounced = await getKeyValue(pool, "firstPlayerAnnounced");

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
            }

            await setKeyValue(pool, "firstPlayerAnnounced", { announced: true });
        }
    }
};

// Handle seeding messages for player count triggers
const handlePlayerTriggers = async (triggerPoints, playerCount, trend, client, pool, channelID, mentions, debounceMinutes) => {
    const now = Date.now();
    const debounceTime = debounceMinutes * 60 * 1000;

    for (let trigger of triggerPoints) {
        const triggerKey = `trigger${trigger}`;
        const triggerStatus = await getKeyValue(pool, triggerKey);

        if (playerCount >= trigger && trend === "up") {
            if (!triggerStatus || now - triggerStatus.timestamp > debounceTime) {
                await sendTriggerMessage(channelID, playerCount, trigger, client, mentions);
                await setKeyValue(pool, triggerKey, { timestamp: now });
                break;
            }
        }
    }
};

// Send a message for each trigger point with randomized content
const sendTriggerMessage = async (channelID, playerCount, trigger, client, mentions) => {
    const channel = await client.channels.fetch(channelID);
    if (channel) {
        const greeting = randomElement(greetings);
        const milestone = randomElement(milestones).replace("{playerCount}", playerCount);
        const closing = randomElement(closings);

        const embed = new EmbedBuilder()
            .setTitle(`${greeting}! 🌱`)
            .setDescription(`${milestone}\n${closing}`)
            .setColor(0x00ff00);

        const content = mentions.map(role => `<@&${role}>`).join(" ");
        await channel.send({ content, embeds: [embed] });
    }
};

// Stop after full seeding
const checkFullSeed = async (maxPlayers, playerCount, trend, client, pool, channelID, mentions) => {
    const fullySeeded = await getKeyValue(pool, "fullySeeded");

    if (playerCount >= maxPlayers && (!fullySeeded || !fullySeeded.announced)) {
        const channel = await client.channels.fetch(channelID);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle("🎉 Fully Seeded! 🎉")
                .setColor(0x00ff00)
                .setDescription(`The server is now fully seeded with **${playerCount} players**! Thanks for helping out!`);

            const content = mentions.map(role => `<@&${role}>`).join(" ");
            await channel.send({ content, embeds: [embed] });
        }

        await setKeyValue(pool, "fullySeeded", { announced: true });
    }
};

// Calculate trend
const calculateTrend = (counts) => {
    if (counts.length < 2) return "stable";
    const changes = counts.slice(1).map((point, index) => point.count - counts[index].count);
    const increasing = changes.filter(change => change > 0).length;
    const decreasing = changes.filter(change => change < 0).length;

    const recentChanges = changes.slice(-3);
    const recentMagnitude = recentChanges.reduce((acc, change) => acc + Math.abs(change), 0);

    if (increasing > decreasing && recentMagnitude > 1) return "up";
    if (decreasing > increasing && recentMagnitude > 1) return "down";
    return "stable";
};

module.exports = async (client, pool, config) => {
    await initializeTable(pool);
    checkSeeds(client, pool, config);
};