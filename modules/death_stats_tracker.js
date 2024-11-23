const API = require("crcon.js");
require("dotenv").config();
const Datastore = require("nedb-promises");

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Randomized messages
const greatRunMessages = [
    "You're on fire! 🔥 Keep it up!",
    "Amazing run, keep pushing!",
    "You're unstoppable out there!",
    "What a performance, you're leading the charge!",
];

const goodRunMessages = [
    "Nice run! You’re really helping the team!",
    "Well done! Keep those stats climbing!",
    "You’re making a difference, stay sharp!",
    "Good job! Keep it going!",
];

const decentRunMessages = [
    "Solid effort, but there's room for more!",
    "You're holding your ground, but can you push harder?",
    "Not bad, but I think you can do better next round!",
    "Keep it steady, you're doing alright.",
];

const poorRunMessages = [
    "That was rough...better luck next time!",
    "Oof, tough break. Try to stay alive longer!",
    "You’re better than this, time to pick up the pace!",
    "That wasn’t your best showing. Let’s do better!",
];

const cowardMessages = [
    "Nice long life...too bad you didn't do much. Were you hiding? 😏",
    "A long life, but no action. Come on, get in the fight!",
    "All that time, and not a single kill? Come on!",
    "Survived long but did nothing? Get back in there!",
];

const quickDeathMessages = [
    "Wow, that was quick... Try to stay alive longer! 🏃‍♂️",
    "You went down fast... Let's aim for more than two minutes next time!",
    "That was a speedrun, but not in a good way...",
    "You barely had time to breathe. Come on, last longer!",
];

const teamkillMessages = [
    "Teamkilling? Come on, watch your fire! 😡",
    "One teamkill is bad...but this? We'll deal with you after the war.",
    "You’re supposed to help your team, not hurt them!",
    "Three teamkills? That's really bad. Get it together!",
];
// Helper function to pick a random element from an array
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Initialize the PostgreSQL tables
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
    const result = await pool.query("SELECT optedOut FROM player_preferences WHERE steamID = $1", [steamID]);
    return result.rows[0]?.optedOut || false;
};

// Fetch player stats
const fetchPlayerStats = async (pool, steamID) => {
    const result = await pool.query("SELECT * FROM death_stats WHERE steamID = $1", [steamID]);
    return result.rows[0];
};

// Save or update player stats
const savePlayerStats = async (pool, playerStats) => {
    const {
        steamID, playerName, kills, kills_streak, teamkills,
        longest_life_secs, shortest_life_secs, combat,
        offense, defense, support, kills_per_minute, kill_death_ratio
    } = playerStats;

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
        steamID, playerName, kills, kills_streak, teamkills,
        longest_life_secs, shortest_life_secs, combat,
        offense, defense, support, kills_per_minute, kill_death_ratio
    ];
    await pool.query(query, values);
};

// Send performance-based message and stats
const sendPerformanceMessage = async (player, differences, isNewPlayer) => {
    const playerID = player.player_id;
    const playerName = player.player;

    // Logic for crafting the message (unchanged)

    const finalMessage = `${message}\n\n${statsSummary}`;

    // Send the message using CRCON API
    await api.message_player({
        player_name: playerName,
        player_id: playerID,
        message: finalMessage,
        by: "Server",
        save_message: false,
    });

    console.log("death_stats_tracker", `Sent message to ${playerName}: ${finalMessage}`);
};

// Process player death and update session stats
const processDeath = async (victimSteamID, pool) => {
    console.log("death_stats_tracker", "Processing death for player:", victimSteamID);

    // Check if the player has opted out
    const optedOut = await fetchOptOutStatus(pool, victimSteamID);
    if (optedOut) {
        console.log(`death_stats_tracker: Player ${victimSteamID} has opted out. Skipping stats processing.`);
        return;
    }

    console.log("death_stats_tracker", "Waiting 15 seconds before fetching stats...");
    await delay(15000);

    // Fetch live scoreboard
    const liveScoreboard = await api.get_live_game_stats();
    const playerStats = liveScoreboard.result.stats.find(player => player.player_id === victimSteamID);

    if (!playerStats) {
        console.error("death_stats_tracker", `No stats found for player with Steam ID: ${victimSteamID}`);
        return;
    }

    // Fetch stored session data
    let storedSession = await fetchPlayerStats(pool, victimSteamID);

    if (!storedSession) {
        // New player
        await savePlayerStats(pool, playerStats);
        console.log("death_stats_tracker", `Started tracking session for player ${playerStats.player}`);
        await sendPerformanceMessage(playerStats, playerStats, true);
        return;
    }

    // Calculate differences
    const differences = {
        kills: playerStats.kills - storedSession.kills,
        kills_streak: playerStats.kills_streak - storedSession.kills_streak,
        teamkills: playerStats.teamkills - storedSession.teamkills,
        longest_life_secs: Math.max(playerStats.longest_life_secs, storedSession.longest_life_secs),
        shortest_life_secs: Math.min(playerStats.shortest_life_secs, storedSession.shortest_life_secs),
        combat: playerStats.combat - storedSession.combat,
        offense: playerStats.offense - storedSession.offense,
        defense: playerStats.defense - storedSession.defense,
        support: playerStats.support - storedSession.support,
    };

    // Update session and send message
    await savePlayerStats(pool, { ...storedSession, ...playerStats });
    await sendPerformanceMessage(playerStats, differences, false);
};

// Clean up the database when a match ends
const cleanUpDatabaseOnMatchEnd = async (pool) => {
    console.log("death_stats_tracker", "Match ended! Cleaning up the database...");
    await pool.query("DELETE FROM death_stats");
};

// Native webhook handler
const nativeWebhook = async (data, config, pool) => {
    const description = data.embeds[0].description || "";

    if (description.split(":")[0].toLowerCase() === 'match ended') {
        await cleanUpDatabaseOnMatchEnd(pool);
        return;
    }

    const victimSteamID = description.split(") -> ")[1]?.split("/")[1]?.split(")")[0]?.trim();
    if (!victimSteamID) {
        console.error("death_stats_tracker", "Failed to extract victim Steam ID.");
        return;
    }

    await processDeath(victimSteamID, pool);
};

// Export the module
module.exports = async (client, pool, config) => {
    await initializeTables(pool);

    if (config.webhook) {
        console.log("death_stats_tracker", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, pool),
        };
    } else {
        console.log("death_stats_tracker", "This module only works with native webhooks for now.");
    }
};