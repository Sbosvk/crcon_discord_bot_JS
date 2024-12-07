const API = require("crcon.js");
require("dotenv").config();

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

// Fetch player opt-out status
const fetchOptOutStatus = async (pool, steamID) => {
    console.log("Checking opt-out status for:", steamID);
    const result = await pool.query(
        "SELECT optedOut FROM player_preferences WHERE steamID = $1",
        [steamID]
    );

    // If no row exists, player is opted in (not opted out)
    const optedOut = result.rows[0]?.optedOut ?? false;
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
const sendPerformanceMessage = async (player, differences, isNewPlayer, optedOut=false) => {

    if (optedOut) {
        console.log(`death_stats_tracker: Skipping performance message for opted-out player ${player.steamID}.`);
        return; // Prevent sending message to opted-out players
    }

    const playerID = player.steamID;
    const playerName = player.playerName;
    const lifeTime = differences.longest_life_secs;
    const teamkills = differences.teamkills;

    // Determine the performance message
    let message = "";
    if (teamkills >= 3) {
        message = randomElement(teamkillMessages);
    } else if (teamkills > 0) {
        message = randomElement(teamkillMessages);
    } else if (lifeTime < 120) {
        message = randomElement(quickDeathMessages);
    } else if (
        differences.kills > 0 ||
        differences.combat +
            differences.offense +
            differences.defense +
            differences.support >
            100
    ) {
        if (
            differences.kills > 0 &&
            differences.combat +
                differences.offense +
                differences.defense +
                differences.support >
                300
        ) {
            message = randomElement(greatRunMessages);
        } else if (
            differences.kills > 0 &&
            differences.combat +
                differences.offense +
                differences.defense +
                differences.support >
                200
        ) {
            message = randomElement(goodRunMessages);
        } else {
            message = randomElement(decentRunMessages);
        }
    } else if (
        lifeTime > 120 &&
        differences.kills === 0 &&
        differences.combat +
            differences.offense +
            differences.defense +
            differences.support <
            150
    ) {
        message = randomElement(cowardMessages);
    } else {
        message = randomElement(poorRunMessages);
    }

    // Generate the stats summary
    let statsSummary = "";

    if (isNewPlayer) {
        statsSummary = `Here are your stats for this life:\n`;

        if (player.kills > 0) statsSummary += `Kills: ${player.kills}\n`;
        if (player.teamkills > 0) statsSummary += `Teamkills: ${player.teamkills}\n`;
        if (player.combat > 0) statsSummary += `Combat: ${player.combat}\n`;
        if (player.offense > 0) statsSummary += `Offense: ${player.offense}\n`;
        if (player.defense > 0) statsSummary += `Defense: ${player.defense}\n`;
        if (player.support > 0) statsSummary += `Support: ${player.support}\n`;
        if (player.longest_life_secs > 0) statsSummary += `Longest Life: ${player.longest_life_secs} seconds\n`;
        if (player.shortest_life_secs > 0) statsSummary += `Shortest Life: ${player.shortest_life_secs} seconds\n`;
    } else {
        statsSummary = `Here's how you did compared to your last life:\n`;

        if (differences.kills > 0) statsSummary += `Kills this life: +${differences.kills} (Total: ${player.kills})\n`;
        if (differences.teamkills > 0) statsSummary += `Teamkills this life: +${differences.teamkills} (Total: ${player.teamkills})\n`;
        if (differences.combat > 0) statsSummary += `Combat this life: +${differences.combat} (Total: ${player.combat})\n`;
        if (differences.offense > 0) statsSummary += `Offense this life: +${differences.offense} (Total: ${player.offense})\n`;
        if (differences.defense > 0) statsSummary += `Defense this life: +${differences.defense} (Total: ${player.defense})\n`;
        if (differences.support > 0) statsSummary += `Support this life: +${differences.support} (Total: ${player.support})\n`;

        // Show cumulative stats even if no improvement, as long as they're non-zero
        if (player.kills > 0 && differences.kills === 0) statsSummary += `\n\nTotal Kills: ${player.kills}\n`;
        if (player.teamkills > 0 && differences.teamkills === 0) statsSummary += `Total Teamkills: ${player.teamkills}\n`;
        if (player.combat > 0 && differences.combat === 0) statsSummary += `Total Combat: ${player.combat}\n`;
        if (player.offense > 0 && differences.offense === 0) statsSummary += `Total Offense: ${player.offense}\n`;
        if (player.defense > 0 && differences.defense === 0) statsSummary += `Total Defense: ${player.defense}\n`;
        if (player.support > 0 && differences.support === 0) statsSummary += `Total Support: ${player.support}\n`;

        if (differences.longest_life_secs > player.longest_life_secs) {
            statsSummary += `Longest Life: ${differences.longest_life_secs} seconds (New Record)\n`;
        } else if (player.longest_life_secs > 0) {
            statsSummary += `Longest Life: ${player.longest_life_secs} seconds\n`;
        }

        if (
            differences.shortest_life_secs !== null &&
            differences.shortest_life_secs < player.shortest_life_secs
        ) {
            statsSummary += `Shortest Life: ${differences.shortest_life_secs} seconds (New Record)\n`;
        } else if (player.shortest_life_secs > 0) {
            statsSummary += `Shortest Life: ${player.shortest_life_secs} seconds\n`;
        }
    }

    if (!statsSummary.trim()) {
        console.log("death_stats_tracker", `No significant changes for ${playerName}, skipping message.`);
        return; // Exit early if no stats to display
    }

    const finalMessage = `${message}\n\n${statsSummary}\n\nYou can opt-out from these performance updates by sending '!stats off' in the chat.`;

    // Send the message using CRCON API
    await api.message_player({
        player_name: playerName,
        player_id: playerID,
        message: finalMessage,
    });

    console.log("death_stats_tracker", `Sent message to ${playerName}`);
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
    const optedOut = await fetchOptOutStatus(pool, victimSteamID);
    console.log("death_stats_tracker", "processDeath", optedOut);
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

// Native webhook handler
const nativeWebhook = async (data, config, pool) => {
    console.log("death_stats_tracker", "Received webhook");
    const description = data.embeds[0]?.description || "";

    // Handle "match ended" events
    if (description.split(":")[0].toLowerCase() === "match ended") {
        await cleanUpDatabaseOnMatchEnd(pool);
        return;
    }

    // Handle "kill" and "teamkill" events
    console.log("death_stats_tracker", "processing description");
    const eventType = description.split(":")[0].toLowerCase();
    if (eventType === "kill" || eventType === "teamkill") {
        console.log("death_stats_tracker", "death detected", description);
        const victimSteamID = description
            .split(") -> ")[1]
            ?.split("/")[1]
            ?.split(")")[0]
            ?.trim();

        if (!victimSteamID) {
            console.error(
                "death_stats_tracker",
                "Failed to extract victim Steam ID."
            );
            return;
        }

        try {
            console.log("death_stats_tracker", "Processing death data", victimSteamID);
            await processDeath(victimSteamID, pool, config);
        } catch (error) {
            console.error(
                "death_stats_tracker",
                `Error processing death for ${victimSteamID}:`,
                error
            );
        }
    }
};

// Export module
module.exports = async (client, pool, config) => {
    console.log("death_stats_tracker", "Using native webhook mode.");
    if (config.webhook) {
        console.log("death_stats_tracker", "Using native webhook mode.");
    }
    return {
        processWebhookData: (data) => nativeWebhook(data, config, pool),
    };
};