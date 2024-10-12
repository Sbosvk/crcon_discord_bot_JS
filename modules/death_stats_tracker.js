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

// Send performance-based message
const sendPerformanceMessage = async (player, differences) => {
    const playerID = player.player_id;
    const playerName = player.player;
    const lifeTime = differences.longest_life_secs;
    const teamkills = differences.teamkills;

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

    // Send the message using CRCON API
    await api.message_player({
        player_name: playerName,
        player_id: playerID,
        message: message,
        by: "Server",
        save_message: false,
    });

    console.log(`Sent message to ${playerName}: ${message}`);
};

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Process player death and update session stats
const processDeath = async (victimSteamID, db) => {
    console.log("Processing death for player:", victimSteamID);

    console.log("Waiting 15 seconds before fetching stats...");
    await delay(15000);
    console.log("Fetching stats after delay.");

    // Fetch the live scoreboard from the API
    const liveScoreboard = await api.get_live_game_stats();
    const playerStats = liveScoreboard.result.stats.find(
        (player) => player.player_id === victimSteamID
    );

    if (!playerStats) {
        console.error(
            `No stats found for player with Steam ID: ${victimSteamID}`
        );
        return;
    }

    let storedSession = await db.findOne({ steamID: victimSteamID });

    if (!storedSession) {
        // First time tracking this player
        console.error(`No session found for Steam ID: ${victimSteamID}`);
        await db.insert({
            steamID: victimSteamID,
            playerName: playerStats.player,
            kills: playerStats.kills,
            kills_streak: playerStats.kills_streak,
            deaths: playerStats.deaths,
            teamkills: playerStats.teamkills,
            longest_life_secs: playerStats.longest_life_secs,
            shortest_life_secs: playerStats.shortest_life_secs,
            combat: playerStats.combat,
            offense: playerStats.offense,
            defense: playerStats.defense,
            support: playerStats.support,
            kills_per_minute: playerStats.kills_per_minute,
            kill_death_ratio: playerStats.kill_death_ratio,
        });
        console.log(
            `Started tracking session for player ${playerStats.player}`
        );
        return;
    }

    // Calculate the differences between the stored and live data
    const differences = {
        kills: playerStats.kills - storedSession.kills,
        kills_streak: playerStats.kills_streak - storedSession.kills_streak,
        deaths: playerStats.deaths - storedSession.deaths,
        teamkills: playerStats.teamkills - storedSession.teamkills,
        longest_life_secs: Math.max(
            playerStats.longest_life_secs,
            storedSession.longest_life_secs
        ),
        shortest_life_secs: Math.min(
            playerStats.shortest_life_secs,
            storedSession.shortest_life_secs
        ),
        combat: playerStats.combat - storedSession.combat,
        offense: playerStats.offense - storedSession.offense,
        defense: playerStats.defense - storedSession.defense,
        support: playerStats.support - storedSession.support,
        kills_per_minute: playerStats.kills_per_minute,
        kill_death_ratio: playerStats.kill_death_ratio,
    };

    // Send a message to the player with their performance
    await sendPerformanceMessage(playerStats, differences);

    // Update stored session data
    await db.update(
        { steamID: victimSteamID },
        {
            $set: {
                kills: playerStats.kills,
                kills_streak: playerStats.kills_streak,
                deaths: playerStats.deaths,
                teamkills: playerStats.teamkills,
                longest_life_secs: differences.longest_life_secs,
                shortest_life_secs: differences.shortest_life_secs,
                combat: playerStats.combat,
                offense: playerStats.offense,
                defense: playerStats.defense,
                support: playerStats.support,
                kills_per_minute: playerStats.kills_per_minute,
                kill_death_ratio: playerStats.kill_death_ratio,
            },
        }
    );
};

// Function to clean up the database when a match ends
const cleanUpDatabaseOnMatchEnd = async (db) => {
    console.log("Match ended! Cleaning up the database...");
    await db.remove({}, { multi: true });
};

const nativeWebhook = async (data, config, db) => {
    const description = data.embeds[0].description || "";
    
    if (description.split(":")[0].toLowerCase() === 'match ended') {
        // Trigger database cleanup on match end
        await cleanUpDatabaseOnMatchEnd(db);
        return;
    }

    // A really ugly way to avoid complicated RegEx
    let victimSteamID = description
    .split(") -> ")[1]
    .split("/")[1]
    .split(")")[0];

    if (!victimSteamID) {
        console.error("Failed to extract victim Steam ID.");
        return;
    }

    await processDeath(victimSteamID, db)
};

module.exports = (client, db, config) => {
    // Start the periodic cleanup job
    startCleanupJob(db);

    if (config.webhook) {
        console.log("death_stats_tracker", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, db),
        };
    } else {
        console.log(
            "death_stats_tracker",
            "This module only works with native webhooks for now."
        );
    }
};
