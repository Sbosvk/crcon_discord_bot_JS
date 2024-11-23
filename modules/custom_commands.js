const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Initialize the PostgreSQL table
const initializeTable = async (pool) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS player_preferences (
            steamID TEXT PRIMARY KEY,
            optedOut BOOLEAN DEFAULT FALSE
        );
    `;
    await pool.query(createTableQuery);
};

// Array to define custom commands
const commands = [
    //=================SWITCH TEAM=================
    {
        trigger: "change",
        isClanOnly: true,
        execute: async (playerName, args, pool, config, webhook) => {
            try {
                const detailedPlayers = await api.get_detailed_players();
                const players = detailedPlayers.result.players;
                const playerSteamID = extractSteamIDFromWebhook(webhook);
                const playerInfo = players[playerSteamID];

                if (!playerInfo) {
                    console.log("custom_commands", `Player ${playerName} not found in detailed players.`);
                    return;
                }

                if (playerName.includes("[Allies][Team]")) playerName = playerName.split("[Allies]")[0];
                else playerName = playerName.split("[Axis]")[0];

                const currentTeam = playerInfo.team; // "axis" or "allies"
                const oppositeTeam = currentTeam === "axis" ? "allies" : "axis"; // Determine the opposite team

                const publicInfo = await api.get_public_info();
                const maxPlayersPerTeam = publicInfo.result.max_player_count / 2; // Max players per team
                const playerCounts = publicInfo.result.player_count_by_team;

                const teamFull = playerCounts[oppositeTeam] >= maxPlayersPerTeam;

                if (teamFull) {
                    await api.message_player({
                        player_name: playerName,
                        player_id: playerSteamID,
                        message: `Sorry ${playerName}, but the ${oppositeTeam} team is currently full.`,
                        by: "Server",
                        save_message: false,
                    });
                    console.log("custom_commands", `Player ${playerName} attempted to switch to ${oppositeTeam}, but the team was full.`);
                } else {
                    const switchResult = await api.switch_player_now({
                        player_name: playerName,
                    });

                    if (switchResult.result) {
                        console.log("custom_commands", `Player ${playerName} switched to ${oppositeTeam} team successfully.`);
                    } else {
                        console.log("custom_commands", `Failed to switch ${playerName} to ${oppositeTeam}.`);
                    }
                }
            } catch (error) {
                console.error("custom_commands", `Error executing 'change' command for ${playerName}:`, error);
            }
        },
    },
    {
        trigger: "stats",
        isClanOnly: false,
        execute: async (playerName, args, pool, config, webhook) => {
            try {
                const playerSteamID = extractSteamIDFromWebhook(webhook);
                if (!playerSteamID) {
                    console.log("custom_commands", `Failed to extract SteamID for ${playerName}.`);
                    return;
                }

                if (args[0] === "on") {
                    const query = `
                        DELETE FROM player_preferences WHERE steamID = $1;
                    `;
                    await pool.query(query, [playerSteamID]);
                    console.log("custom_commands", `${playerName} has opted in for death stats.`);
                    await api.message_player({
                        player_id: playerSteamID,
                        message: "You have successfully opted IN for death stats updates.",
                    });
                } else if (args[0] === "off") {
                    const query = `
                        INSERT INTO player_preferences (steamID, optedOut)
                        VALUES ($1, TRUE)
                        ON CONFLICT (steamID)
                        DO UPDATE SET optedOut = TRUE;
                    `;
                    await pool.query(query, [playerSteamID]);
                    console.log("custom_commands", `${playerName} has opted out of death stats.`);
                    await api.message_player({
                        player_id: playerSteamID,
                        message: "You have successfully opted OUT of death stats updates.",
                    });
                } else {
                    console.log("custom_commands", `Invalid argument for stats command: ${args[0]}`);
                    await api.message_player({
                        player_id: playerSteamID,
                        message: "Invalid command. Use `!stats on` to opt-in or `!stats off` to opt-out.",
                    });
                }
            } catch (error) {
                console.error("custom_commands", `Error executing stats command for ${playerName}:`, error);
            }
        },
    },
];

// Function to extract SteamID from a player's webhook data
function extractSteamIDFromWebhook(webhook) {
    const playerId = webhook.embeds[0]?.author?.url?.match(/\/profiles\/(\d+)/);
    return playerId ? playerId[1] : null;
}

// Function to check if a player is a clan member
const isClanMember = (playerName, config) => {
    const clanPrefix = config.clanPrefix || "[ClanTag]"; // Default or provided clan prefix
    return playerName.startsWith(clanPrefix);
};

// Function to process incoming webhook data
const processChatWebhook = (data, pool, config) => {
    const embed = data.embeds[0];
    const playerMessage = embed.description;
    const playerName = embed.author.name;

    // Check if the message starts with '!' or '@' and is a command
    if (playerMessage.startsWith("!") || playerMessage.startsWith("@")) {
        const [commandTrigger, ...args] = playerMessage.substring(1).split(" ");
        const command = commands.find((cmd) => cmd.trigger === commandTrigger);

        if (command) {
            if (command.isClanOnly && !isClanMember(playerName, config)) {
                console.log("custom_commands", `Player ${playerName} is not a clan member. Command ignored.`);
                return;
            }

            command.execute(playerName, args, pool, config, data);
        } else {
            console.log("custom_commands", `Unknown command: ${commandTrigger}`);
        }
    }
};

// Native webhook handler
const nativeWebhook = (data, config, pool) => {
    processChatWebhook(data, pool, config);
};

// Initialize the module
module.exports = async (client, pool, config) => {
    await initializeTable(pool);

    if (config.webhook) {
        console.log("custom_commands", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, pool),
        };
    }
};
