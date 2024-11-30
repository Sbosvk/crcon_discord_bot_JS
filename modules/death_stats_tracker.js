const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Initialize PostgreSQL tables
const initializeTables = async (pool) => {
    const createPreferencesTableQuery = `
        CREATE TABLE IF NOT EXISTS player_preferences (
            steamID TEXT PRIMARY KEY,
            optedOut BOOLEAN DEFAULT FALSE
        );
    `;
    const createStatsTableQuery = `
        CREATE TABLE IF NOT EXISTS death_stats (
            steamID TEXT PRIMARY KEY,
            playerName TEXT,
            kills INTEGER DEFAULT 0,
            kills_streak INTEGER DEFAULT 0,
            teamkills INTEGER DEFAULT 0,
            longest_life_secs INTEGER DEFAULT 0,
            shortest_life_secs INTEGER DEFAULT NULL,
            combat INTEGER DEFAULT 0,
            offense INTEGER DEFAULT 0,
            defense INTEGER DEFAULT 0,
            support INTEGER DEFAULT 0,
            kills_per_minute NUMERIC DEFAULT 0,
            kill_death_ratio NUMERIC DEFAULT 0
        );
    `;
    await pool.query(createPreferencesTableQuery);
    await pool.query(createStatsTableQuery);
};

// Fetch player opt-out status
const fetchOptOutStatus = async (pool, steamID) => {
    const result = await pool.query(
        "SELECT optedOut FROM player_preferences WHERE steamID = $1",
        [steamID]
    );
    return result.rows[0]?.optedOut ?? false;
};

// Fetch player stats
const fetchPlayerStats = async (pool, steamID) => {
    const result = await pool.query(
        "SELECT * FROM death_stats WHERE steamID = $1",
        [steamID]
    );
    return result.rows[0];
};

// Save player stats
const savePlayerStats = async (pool, playerStats) => {
    const query = `
        INSERT INTO death_stats (
            steamID, playerName, kills, kills_streak, teamkills,
            longest_life_secs, shortest_life_secs, combat,
            offense, defense, support, kills_per_minute, kill_death_ratio
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (steamID)
        DO UPDATE SET
            playerName = EXCLUDED.playerName,
            kills = EXCLUDED.kills,
            kills_streak = EXCLUDED.kills_streak,
            teamkills = EXCLUDED.teamkills,
            longest_life_secs = GREATEST(death_stats.longest_life_secs, EXCLUDED.longest_life_secs),
            shortest_life_secs = LEAST(death_stats.shortest_life_secs, EXCLUDED.shortest_life_secs),
            combat = EXCLUDED.combat,
            offense = EXCLUDED.offense,
            defense = EXCLUDED.defense,
            support = EXCLUDED.support,
            kills_per_minute = EXCLUDED.kills_per_minute,
            kill_death_ratio = EXCLUDED.kill_death_ratio;
    `;
    const values = [
        playerStats.steamID,
        playerStats.playerName,
        playerStats.kills,
        playerStats.kills_streak,
        playerStats.teamkills,
        playerStats.longest_life_secs,
        playerStats.shortest_life_secs,
        playerStats.combat,
        playerStats.offense,
        playerStats.defense,
        playerStats.support,
        playerStats.kills_per_minute,
        playerStats.kill_death_ratio,
    ];
    await pool.query(query, values);
};

// Sentence generation components
const sentenceParts = {
    subjects: [
        "Your effort",
        "That last run",
        "Your performance",
        "Your contribution",
        "This match",
    ],
    adjectives: {
        positive: ["brilliant", "exceptional", "incredible", "remarkable", "outstanding"],
        neutral: ["solid", "decent", "consistent", "acceptable", "sufficient"],
        negative: ["subpar", "disappointing", "lackluster", "mediocre", "poor"],
    },
    adverbs: {
        positive: ["brilliantly", "flawlessly", "skillfully", "masterfully", "exceptionally"],
        neutral: ["adequately", "reasonably", "sufficiently", "moderately", "competently"],
        negative: ["clumsily", "poorly", "ineffectively", "awkwardly", "hastily"],
    },
    verbs: {
        positive: ["dominated", "excelled", "outperformed", "shined", "triumphed"],
        neutral: ["competed", "participated", "engaged", "performed", "tried"],
        negative: ["struggled", "faltered", "underperformed", "hesitated", "failed"],
    },
    transitions: [
        "despite the challenges",
        "considering the circumstances",
        "while facing tough opposition",
        "with some room for improvement",
        "under challenging conditions",
    ],
    conclusions: {
        positive: [
            "Keep it up, and you'll keep leading the charge!",
            "You're a key asset to the team.",
            "Outstanding work, soldier!",
        ],
        neutral: [
            "Stay consistent, and you'll see even better results.",
            "Solid effort overall.",
            "A good performance, but there's room for more.",
        ],
        negative: [
            "Let's step it up next time.",
            "Don't let this hold you back—improve and try again!",
            "Shake it off and come back stronger.",
        ],
    },
};

// Generate a feedback sentence
const generateAdvancedSentence = (sentiment) => {
    const { subjects, adjectives, adverbs, verbs, transitions, conclusions } = sentenceParts;
    return `${randomElement(subjects)} was ${randomElement(adjectives[sentiment])} and ${randomElement(adverbs[sentiment])} executed as you ${randomElement(verbs[sentiment])}, ${randomElement(transitions)}. ${randomElement(conclusions[sentiment])}`;
};

// Determine performance sentiment
const getPerformanceSentiment = (stats) => {
    if (stats.teamkills > 2) return "negative";
    if (stats.kills > 10 || stats.combat + stats.offense + stats.defense > 500) return "positive";
    if (stats.kills < 2 && stats.teamkills === 0) return "negative";
    return "neutral";
};

// Send performance-based message
const sendPerformanceMessage = async (player, stats) => {
    const sentiment = getPerformanceSentiment(stats);
    const message = generateAdvancedSentence(sentiment);

    const statsSummary = [
        stats.kills > 0 ? `Kills: ${stats.kills}` : null,
        stats.teamkills > 0 ? `Teamkills: ${stats.teamkills}` : null,
        stats.combat > 0 ? `Combat Score: ${stats.combat}` : null,
        stats.offense > 0 ? `Offense Score: ${stats.offense}` : null,
        stats.defense > 0 ? `Defense Score: ${stats.defense}` : null,
        stats.support > 0 ? `Support Score: ${stats.support}` : null,
    ]
        .filter(Boolean)
        .join("\n");

    const finalMessage = `${message}\n\n${statsSummary}`;
    await api.message_player({ player_name: player.playerName, player_id: player.steamID, message: finalMessage });
};

// Process deaths and stats
const processDeath = async (victimSteamID, pool, config) => {
    const optedOut = await fetchOptOutStatus(pool, victimSteamID);
    if (optedOut) return;

    const delay = config.pollDelay ? config.pollDelay * 1000 : 3000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const scoreboard = await api.get_live_game_stats();
    const playerStats = scoreboard.result.stats.find((p) => p.player_id === victimSteamID);
    if (!playerStats) return;

    const storedStats = await fetchPlayerStats(pool, victimSteamID);
    const differences = calculateDifferences(storedStats, playerStats);

    await savePlayerStats(pool, playerStats);
    await sendPerformanceMessage(playerStats, differences);
};

// Webhook handler
const nativeWebhook = async (data, config, pool) => {
    const description = data.embeds[0]?.description || "";
    if (description.startsWith("KILL") || description.startsWith("TEAMKILL")) {
        const victimSteamID = description.split(") -> ")[1]?.split("/")[1]?.split(")")[0]?.trim();
        if (victimSteamID) await processDeath(victimSteamID, pool, config);
    }
};

// Module export
module.exports = async (client, pool, config) => {
    await initializeTables(pool);
    return { processWebhookData: (data) => nativeWebhook(data, config, pool) };
};
