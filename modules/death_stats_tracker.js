const { logStreamManager } = require('./log_stream_manager');

const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Helper function to pick a random element from an array
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

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

// Fetch player opt-out status
const fetchOptOutStatus = async (pool, steamID) => {
    console.log("Checking opt-out status for:", steamID);
    const result = await pool.query(
        "SELECT optedOut FROM player_preferences WHERE steamID = $1",
        [steamID]
    );

    // If no row exists, player is opted in (not opted out)
    const optedOut = result.rows[0]?.optedout ?? false;
    console.log(`Opt-out query result for ${steamID}: ${optedOut ? "Opted Out" : "Opted In"}`);
    return optedOut;
};

// Fetch player stats
const fetchPlayerStats = async (pool, steamID) => {
    const result = await pool.query(
        "SELECT * FROM death_stats WHERE steamID = $1",
        [steamID]
    );
    return result.rows[0];
};

// Save or update player stats
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

// Process and send performance-based message
const sendPerformanceMessage = async (player, differences, isNewPlayer, optedOut = false) => {
    if (optedOut) {
        console.log(`death_stats_tracker: Skipping performance message for opted-out player ${player.steamID}.`);
        return; // Prevent sending message to opted-out players
    }

    // Determine sentiment and generate message
    const sentiment = getPerformanceSentiment(differences);
    const message = generateAdvancedSentence(sentiment);

    // Generate the stats summary
    let statsSummary = isNewPlayer
        ? `Here are your stats for this life:\n`
        : `Here's how you did compared to your last life:\n`;

    if (differences.kills > 0) statsSummary += `Kills this life: +${differences.kills} (Total: ${player.kills})\n`;
    if (differences.teamkills > 0) statsSummary += `Teamkills this life: +${differences.teamkills} (Total: ${player.teamkills})\n`;
    if (differences.combat > 0) statsSummary += `Combat this life: +${differences.combat} (Total: ${player.combat})\n`;
    if (differences.offense > 0) statsSummary += `Offense this life: +${differences.offense} (Total: ${player.offense})\n`;
    if (differences.defense > 0) statsSummary += `Defense this life: +${differences.defense} (Total: ${player.defense})\n`;
    if (differences.support > 0) statsSummary += `Support this life: +${differences.support} (Total: ${player.support})\n`;

    const finalMessage = `${message}\n\n${statsSummary.trim()}\n\nYou can opt-out from these performance updates by sending '!stats off' in the chat.`;

    // Send the message using CRCON API
    api.message_player({
        player_name: player.playerName,
        player_id: player.steamID,
        by: "1st Airborne Helper",
        message: finalMessage,
    });

    console.log("death_stats_tracker", `Sent message to ${player.playerName}`);
};

// Calculate differences between stored stats and current stats
const calculateDifferences = (storedStats, currentStats) => {
    if (!storedStats) {
        return {
            kills: currentStats.kills,
            kills_streak: currentStats.kills_streak,
            teamkills: currentStats.teamkills,
            longest_life_secs: currentStats.longest_life_secs,
            shortest_life_secs: currentStats.shortest_life_secs,
            combat: currentStats.combat,
            offense: currentStats.offense,
            defense: currentStats.defense,
            support: currentStats.support,
        };
    }

    return {
        kills: currentStats.kills - storedStats.kills,
        kills_streak: currentStats.kills_streak - storedStats.kills_streak,
        teamkills: currentStats.teamkills - storedStats.teamkills,
        longest_life_secs: Math.max(currentStats.longest_life_secs, storedStats.longest_life_secs),
        shortest_life_secs: Math.min(
            currentStats.shortest_life_secs ?? Infinity,
            storedStats.shortest_life_secs ?? Infinity
        ),
        combat: currentStats.combat - storedStats.combat,
        offense: currentStats.offense - storedStats.offense,
        defense: currentStats.defense - storedStats.defense,
        support: currentStats.support - storedStats.support,
    };
};

// Process deaths and differences
const processDeath = async (victimSteamID, pool, config) => {

     // Check opt-out status
     const optedOut = await fetchOptOutStatus(pool, victimSteamID)
     .then((status) => {
         console.log(`death_stats_tracker: Opt-out status for ${victimSteamID}: ${status}`);
         return status;
     })
     .catch((error) => {
         console.error(`death_stats_tracker: Error fetching opt-out status for ${victimSteamID}:`, error);
         return true; // Default to opted-out on error
     });

    if (optedOut) {
        console.log(`death_stats_tracker: Player ${victimSteamID} has opted out. No further processing.`);
        return; // Ensure nothing else happens for opted-out players
    }

    const pollDelay = config.pollDelay ? config.pollDelay * 1000 : 3000; // Default delay to 3 seconds
    console.log(`death_stats_tracker: Delaying API fetch by ${pollDelay}ms for player ${victimSteamID}.`);

    // Introduce a delay before fetching stats
    await new Promise((resolve) => setTimeout(resolve, pollDelay));

    // Fetch live game stats
    const scoreboard = await api.get_live_game_stats();
    const playerStats = scoreboard.result.stats.find(
        (p) => p.player_id === victimSteamID
    );

    if (!playerStats) {
        console.error(`death_stats_tracker: No stats found for player ${victimSteamID}.`);
        return;
    }

    // Map playerStats fields to the expected format
    const mappedPlayerStats = {
        steamID: playerStats.player_id,
        playerName: playerStats.player,
        kills: playerStats.kills,
        kills_streak: playerStats.kills_streak,
        teamkills: playerStats.teamkills,
        longest_life_secs: playerStats.longest_life_secs,
        shortest_life_secs: playerStats.shortest_life_secs || null,
        combat: playerStats.combat,
        offense: playerStats.offense,
        defense: playerStats.defense,
        support: playerStats.support,
        kills_per_minute: playerStats.kills_per_minute,
        kill_death_ratio: playerStats.kill_death_ratio,
    };

    // Fetch stored stats and calculate differences
    const storedStats = await fetchPlayerStats(pool, victimSteamID);
    const differences = calculateDifferences(storedStats, mappedPlayerStats);

    // Save stats and send performance message
    try {
        await savePlayerStats(pool, mappedPlayerStats);
        console.log("death_stats_tracker: Player stats saved to db");

        console.log(`death_stats_tracker: Sending performance message for player ${victimSteamID}.`);
        await sendPerformanceMessage(mappedPlayerStats, differences, !storedStats, optedOut);
        console.log("death_stats_tracker: Performance message sent");
    } catch (error) {
        console.error("death_stats_tracker: Error during processing:", error);
    }
};

module.exports = (client, pool, config) => {
    // Subscribe to `KILL` and `TEAM KILL` actions in the log stream
    logStreamManager.subscribe("KILL");
    logStreamManager.subscribe("TEAM KILL");
    logStreamManager.subscribe("MATCH ENDED");

    // Handle KILL and TEAM KILL logs
    const handleDeathLog = async (log) => {
        try {
            await processDeath(log.player_id_2, pool, config);
        } catch (error) {
            console.error("🧩 Error processing death log for death stats tracker:", error);
        }
    };

    // Handle MATCH ENDED logs
    const handleMatchEnded = async () => {
        try {
            await pool.query("DELETE FROM death_stats");
            console.log("🧩 Death stats table cleared on match end.");
        } catch (error) {
            console.error("🧩 Error clearing death_stats table on match end:", error);
        }
    };

    // Listen for KILL logs
    logStreamManager.on("KILL", handleDeathLog);

    // Listen for TEAM KILL logs
    logStreamManager.on("TEAM KILL", handleDeathLog);

    // Listen for MATCH ENDED logs
    logStreamManager.on("MATCH ENDED", handleMatchEnded);
};