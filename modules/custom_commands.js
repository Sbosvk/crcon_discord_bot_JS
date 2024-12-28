const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Array to define custom commands
const commands = [
        //=================SWITCH TEAM=================
    {
        trigger: "change",
        isClanOnly: true,
        execute: async (playerName, args, pool, config, webhook) => {
            try {
                const detailedPlayers = await api.get_detailed_players();
                const players = detailedPlayers.players;
                const playerSteamID = extractSteamIDFromWebhook(webhook);
                const playerInfo = players[playerSteamID];

                if (!playerInfo) {
                    console.warn("🧩", `Player ${playerName} not found in detailed players.`);
                    return;
                }

                if (playerName.includes("[Allies][Team]")) playerName = playerName.split("[Allies]")[0];
                else playerName = playerName.split("[Axis]")[0];

                const currentTeam = playerInfo.team;
                const oppositeTeam = currentTeam === "axis" ? "allies" : "axis";

                const publicInfo = await api.get_public_info();
                const maxPlayersPerTeam = publicInfo.max_player_count / 2;
                const playerCounts = publicInfo.player_count_by_team;

                const teamFull = playerCounts[oppositeTeam] >= maxPlayersPerTeam;

                if (teamFull) {
                    await api.message_player({
                        player_name: playerName,
                        player_id: playerSteamID,
                        message: `Sorry ${playerName}, but the ${oppositeTeam} team is currently full.`,
                        by: "Server",
                        save_message: false,
                    });
                    console.log("🧩", `Player ${playerName} attempted to switch to ${oppositeTeam}, but the team was full.`);
                } else {
                    const switchResult = await api.switch_player_now({
                        player_name: playerName,
                    });

                    if (switchResult.result) {
                        console.log("🧩", `Player ${playerName} switched to ${oppositeTeam} team successfully.`);
                    } else {
                        console.log("🧩", `Failed to switch ${playerName} to ${oppositeTeam}.`);
                    }
                }
            } catch (error) {
                console.error("🧩", `Error executing 'change' command for ${playerName}:`, error);
            }
        },
    },
        //=================STATS OPT-OUT=================
    {
        trigger: "stats",
        isClanOnly: false,
        execute: async (playerName, args, pool, config, webhook) => {
            try {
                const playerSteamID = extractSteamIDFromWebhook(webhook);
                if (!playerSteamID) {
                    console.log("🧩", `Failed to extract SteamID for ${playerName}.`);
                    return;
                }

                if (args[0] === "on") {
                    const query = `
                        DELETE FROM player_preferences WHERE steamID = $1;
                    `;
                    await pool.query(query, [playerSteamID]);
                    console.log("🧩", `${playerName} has opted in for death stats.`);
                    api.message_player({
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
                    console.log("🧩", `${playerName} has opted out of death stats.`);
                    api.message_player({
                        player_id: playerSteamID,
                        message: "You have successfully opted OUT of death stats updates.",
                    });
                } else {
                    console.log("🧩", `Invalid argument for stats command: ${args[0]}`);
                    api.message_player({
                        player_id: playerSteamID,
                        message: "Invalid command. Use `!stats on` to opt-in or `!stats off` to opt-out.",
                    });
                }
            } catch (error) {
                console.error("🧩", `Error executing stats command for ${playerName}:`, error);
            }
        },
    },
    //=================TIPS=================
    {
        trigger: "tip",
        isClanOnly: false,
        execute: async (playerName, args, pool, config, webhook) => {
            try {
                const phrases = config.tips.phrases;
                if (!phrases || phrases.length === 0) {
                    throw new Error("No tips phrases found in the config.");
                }

                const playerSteamID = extractSteamIDFromWebhook(webhook);

                const randomTip = phrases[Math.floor(Math.random() * phrases.length)];

                api.message_player({
                    player_id: playerSteamID,
                    message: randomTip,
                    by: "1st Airborne helper",
                });
            } catch(error) {
                console.error("Error executing the 'tip' custom command:", error);
            }
        }
    }
];

// Function to extract SteamID from a player's webhook data
function extractSteamIDFromWebhook(webhook) {
    const playerId = webhook.embeds[0]?.author?.url?.match(/\/profiles\/(\d+)/);
    return playerId ? playerId[1] : null;
}

// Function to check if a player is a clan member
const isClanMember = (playerName, config) => {
    const clanPrefix = config.clanPrefix || "[ClanTag]";
    return playerName.startsWith(clanPrefix);
};

// Function to process incoming webhook data
const processChatWebhook = (data, config, pool) => {
    const embed = data.embeds[0];
    const playerMessage = embed.description;
    const playerName = embed.author.name;

    // Check if the message starts with '!' or '@' and is a command
    if (playerMessage.startsWith("!") || playerMessage.startsWith("@")) {
        const [commandTrigger, ...args] = playerMessage.substring(1).split(" ");
        const command = commands.find((cmd) => cmd.trigger === commandTrigger);

        if (command) {
            if (command.isClanOnly && !isClanMember(playerName, config)) {
                console.log("🧩", `Player ${playerName} is not a clan member. Command ignored.`);
                return;
            }

            command.execute(playerName, args, pool, config, data);
        } else {
            console.log("🧩", `Unknown command: ${commandTrigger}`);
        }
    }
};

// Native webhook handler
const nativeWebhook = (data, config, pool) => {
    processChatWebhook(data, config, pool);
};

// Initialize the module
module.exports = async (client, pool, config) => {
    // if (config.webhook) {
        return {
            processWebhookData: (data) => nativeWebhook(data, config, pool),
        };
    // }
};
