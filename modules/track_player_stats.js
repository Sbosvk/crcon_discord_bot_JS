const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const rolePoints = {
    commander: 5,
    engineer: 4,
    machinegunner: 4,
    antitank: 3,
    automaticrifleman: 3,
    assault: 2,
    officer: 2,
    sniper: 2,
    spotter: 2,
    rifleman: 1,
    medic: 1,
    support: 1,
    tankcommander: 1,
    tankcrewman: 1
};

const vehiclePoints = {
    recon_tank: { base: 50, maxCrew: 5 },
    light_tank: { base: 50, maxCrew: 3 },
    medium_tank: { base: 75, maxCrew: 3 },
    heavy_tank: { base: 100, maxCrew: 3 },
    light_vehicle: { base: 50, maxCrew: 10 },
    transport_truck: { base: 50, maxCrew: 10 },
    jeep: {base: 50, maxCrew: 4},
    anti_tank_gun: { base: 30, maxCrew: 2 }
    //Half track is missing
};

// Event Pool to store live events for ±2-second matching
let eventPool = [];

// Update Player Stats in DB
const updatePlayerStats = async (pool, playerData) => {
    const query = `
        INSERT INTO live_game_scores (
            steamID, playerName, role, squad, team, combatPoints, supportPoints,
            offensivePoints, defensivePoints, nodesBuilt, nodesDestroyed,
            garrisonsBuilt, garrisonsDestroyed, vehiclesDestroyed, tanksDestroyed, lastUpdate
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        ON CONFLICT (steamID)
        DO UPDATE SET
            playerName = EXCLUDED.playerName,
            role = EXCLUDED.role,
            squad = EXCLUDED.squad,
            team = EXCLUDED.team,
            combatPoints = live_game_scores.combatPoints + EXCLUDED.combatPoints,
            supportPoints = live_game_scores.supportPoints + EXCLUDED.supportPoints,
            offensivePoints = live_game_scores.offensivePoints + EXCLUDED.offensivePoints,
            defensivePoints = live_game_scores.defensivePoints + EXCLUDED.defensivePoints,
            nodesBuilt = live_game_scores.nodesBuilt + EXCLUDED.nodesBuilt,
            nodesDestroyed = live_game_scores.nodesDestroyed + EXCLUDED.nodesDestroyed,
            garrisonsBuilt = live_game_scores.garrisonsBuilt + EXCLUDED.garrisonsBuilt,
            garrisonsDestroyed = live_game_scores.garrisonsDestroyed + EXCLUDED.garrisonsDestroyed,
            vehiclesDestroyed = live_game_scores.vehiclesDestroyed + EXCLUDED.vehiclesDestroyed,
            tanksDestroyed = live_game_scores.tanksDestroyed + EXCLUDED.tanksDestroyed,
            lastUpdate = NOW();
    `;
    const values = [
        playerData.steamID, playerData.playerName, playerData.role, playerData.squad,
        playerData.team, playerData.combatPoints, playerData.supportPoints,
        playerData.offensivePoints, playerData.defensivePoints,
        playerData.nodesBuilt, playerData.nodesDestroyed,
        playerData.garrisonsBuilt, playerData.garrisonsDestroyed,
        playerData.vehiclesDestroyed, playerData.tanksDestroyed
    ];
    await pool.query(query, values);
};

// Process Kill Webhook
const processKillWebhook = async (data) => {
    const description = data.embeds[0]?.description || "";
    const timestamp = new Date(data.embeds[0]?.timestamp).getTime();

    const killerSection = description.split(" -> ")[0];
    const victimSection = description.split(" -> ")[1];
    const killerSteamID = killerSection.split("/")[1]?.split(")")[0]?.trim();
    const victimSteamID = victimSection.split("/")[1]?.split(")")[0]?.trim();

    const teamView = await api.get_team_view();
    const victimData = teamView.result.players[victimSteamID] || {};
    const victimRole = victimData.role || "Unknown";

    eventPool.push({
        type: "kill",
        timestamp,
        killer: { steamID: killerSteamID },
        victim: { steamID: victimSteamID, role: victimRole },
    });

    // Keep events in the pool within a 2-second window
    const now = Date.now();
    eventPool = eventPool.filter((event) => Math.abs(now - event.timestamp) <= 2000);
};

// Process Score Change
const processScoreChange = async (changedPlayers, pool) => {
    for (const player of changedPlayers) {
        const { steamID, newScore, timestamp } = player;

        // Match with Event Pool
        const relatedEvents = eventPool.filter(
            (event) => event.killer.steamID === steamID && Math.abs(event.timestamp - timestamp) <= 2000
        );

        let playerStats = {
            steamID,
            playerName: player.name,
            role: player.role,
            squad: player.squad,
            team: player.team,
            combatPoints: 0,
            supportPoints: 0,
            offensivePoints: 0,
            defensivePoints: 0,
            nodesBuilt: 0,
            nodesDestroyed: 0,
            garrisonsBuilt: 0,
            garrisonsDestroyed: 0,
            vehiclesDestroyed: 0,
            tanksDestroyed: 0
        };

        for (const event of relatedEvents) {
            if (event.type === "kill") {
                playerStats.combatPoints += calculateCombatPoints(event);

                // Check for tanks or vehicles
                if (event.victim.role === "tank_crewman" || event.victim.role === "tank_commander") {
                    playerStats.tanksDestroyed += 1;
                } else if (vehiclePoints[event.victim.role]) {
                    playerStats.vehiclesDestroyed += 1;
                }
            }
        }

        await updatePlayerStats(pool, playerStats);
    }
};

// Calculate Combat Points
const calculateCombatPoints = (event) => {
    if (rolePoints[event.victim.role]) return rolePoints[event.victim.role];
    if (vehiclePoints[event.victim.role]) return vehiclePoints[event.victim.role].base;
    return 0; // Default for undefined roles
};

// Initialize the Module
module.exports = async (client, pool, config) => {
    if (config.webhook) {
        console.log("live_game_scores", "Using native webhook mode.");
        return {
            processWebhookData: (data) => processKillWebhook(data)
        };
    }

    setInterval(async () => {
        const liveStats = await api.get_game_stats();
        const changedPlayers = []; // Compare liveStats with DB and populate this array
        await processScoreChange(changedPlayers, pool);
    }, config.pollingInterval * 1000);
};
