const { logStreamManager } = require('./log_stream_manager');
const { isCommand } = require('../utils/logStream');
const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const messages_by = (config) => {
    return config.messages_by  ? config.messages_by: "bot";
}

module.exports = (client, pool, config) => {
    const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

    // Array to define custom commands
    const commands = [
        //=================List commands=================
        {
            trigger: "commands",
            description: "List all available commands.",
            isClanOnly: false,
            execute: async function (log, pool, config) {
                try {
                    const playerSteamID = log.player_id_1;
                    const playerName = log.player_name_1;

                    // Construct a message with all commands
                    const commandList = commands
                        .map((cmd) => `!${cmd.trigger}: ${cmd.description}`)
                        .join("\n\n");

                    // Send the constructed message to the player
                    await api.message_player({
                        player_id: playerSteamID,
                        message: `Available Commands:\n${commandList}`,
                        by: messages_by(config)
                    });

                    console.log(`🧩 Sent command list to ${playerName}`);
                } catch (error) {
                    console.error(`🧩 Error executing custom command '${this.trigger}':`, error);
                }
            }
        },
        //=================SWITCH TEAM=================
        {
            trigger: "change",
            description: "Change your team immediately. Only available to clan member.",
            isClanOnly: true,
            execute: async function (log, pool, config) {
                try {
                    const playerSteamID = log.player_id_1;
                    const playerName = log.player_name_1;
        
                    // Determine the current team from the `log.action` field
                    const currentTeam = log.action.includes("Axis") ? "axis" : "allies";
                    const oppositeTeam = currentTeam === "axis" ? "allies" : "axis";
        
                    const detailedPlayers = await api.get_detailed_players();
                    const players = detailedPlayers.players;
                    const playerInfo = players[playerSteamID];
        
                    if (!playerInfo) {
                        console.warn(`🧩 Player ${playerName} not found in detailed players.`);
                        return;
                    }
        
                    const publicInfo = await api.get_public_info();
                    const maxPlayersPerTeam = publicInfo.max_player_count / 2;
                    const playerCounts = publicInfo.player_count_by_team;
        
                    const teamFull = playerCounts[oppositeTeam] >= maxPlayersPerTeam;
        
                    if (teamFull) {
                        await api.message_player({
                            player_name: playerName,
                            player_id: playerSteamID,
                            message: `Sorry ${playerName}, but the ${oppositeTeam} team is currently full.`,
                            by: messages_by(config)
                        });
                        console.log(`🧩 Player ${playerName} attempted to switch to ${oppositeTeam}, but the team was full.`);
                    } else {
                        const switchResult = await api.switch_player_now({
                            player_name: playerName,
                        });
        
                        if (switchResult) {
                            console.log(`🧩 Player ${playerName} switched to ${oppositeTeam} team successfully.`);
                        } else {
                            console.log(`🧩 Failed to switch ${playerName} to ${oppositeTeam}.`);
                        }
                    }
                } catch (error) {
                    console.error(`🧩 Error executing custom command 'change':`, error);
                }
            }
        },
        //=================STATS OPT-OUT=================
        {
            trigger: "stats",
            description: "Opt-out for death stats. Usage: '!stats on' or '!stats off'",
            isClanOnly: false,
            execute: async function (log, pool, config) {
                try {
                    const playerSteamID = log.player_id_1;
                    const playerName = log.player_name_1;
                    const [_, action] = log.sub_content.split(/\s+/); // Extract the action (e.g., "on", "off")

                    if (!action) {
                        console.log("🧩", `Invalid stats command arguments from ${playerName}.`);
                        return;
                    }

                    if (action === "on") {
                        await pool.query(`DELETE FROM player_preferences WHERE steamID = $1;`, [playerSteamID]);
                        console.log("🧩", `${playerName} has opted in for death stats.`);
                        await api.message_player({
                            player_id: playerSteamID,
                            message: "You have successfully opted IN for death stats updates.",
                            by: messages_by(config)
                        });
                    } else if (action === "off") {
                        await pool.query(`
                            INSERT INTO player_preferences (steamID, optedOut)
                            VALUES ($1, TRUE)
                            ON CONFLICT (steamID)
                            DO UPDATE SET optedOut = TRUE;
                        `, [playerSteamID]);
                        console.log("🧩", `${playerName} has opted out of death stats.`);
                        await api.message_player({
                            player_id: playerSteamID,
                            message: "You have successfully opted OUT of death stats updates.",
                            by: messages_by(config)
                        });
                    } else {
                        console.log("🧩", `Invalid argument for stats command: ${action}`);
                        await api.message_player({
                            player_id: playerSteamID,
                            message: "Invalid command. Use `!stats on` to opt-in or `!stats off` to opt-out.",
                            by: messages_by(config)
                        });
                    }
                } catch (error) {
                    console.error(`🧩 Error executing custom command '${this.trigger}':`, error);
                }
            }
        },
        //=================TIPS=================
        {
            trigger: "tip",
            description: "Get a random tip.",
            isClanOnly: false,
            execute: async function (log, pool, config) {
                try {
                    const phrases = config.tips.phrases;
                    if (!phrases || phrases.length === 0) {
                        throw new Error("No tips phrases found in the config.");
                    }
        
                    const playerSteamID = log.player_id_1;
                    const playerName = log.player_name_1;
        
                    // Select a random tip
                    const randomTip = phrases[Math.floor(Math.random() * phrases.length)];
        
                    // Send the tip to the player
                    await api.message_player({
                        player_id: playerSteamID,
                        message: randomTip,
                        by: messages_by(config)
                    });
        
                    console.log(`🧩 Sent a random tip to ${playerName} (SteamID: ${playerSteamID}).`);
                } catch (error) {
                    console.error(`🧩 Error executing custom command 'tip':`, error);
                }
            }
        }        
    ];

    const isClanMember = (playerName, config) => {
        const clanPrefix = config.clanPrefix || "[ClanTag]";
        return playerName.startsWith(clanPrefix);
    };

    const extractTeam = (action) => {
        const match = action.match(/\[(Allies|Axis)\]/);
        return match ? match[1] : "Unknown";
    };

    const processChatLog = async (log) => {
        try {
            const commandCheck = isCommand(log);
            if (!commandCheck.result) return; // Not a command, ignore

            const [commandTrigger] = commandCheck.content.split(/\s+/);
            const command = commands.find((cmd) => cmd.trigger === commandTrigger);

            if (command) {
                const playerName = log.player_name_1 || "Unknown Player";
                if (command.isClanOnly && !isClanMember(playerName, config)) {
                    console.log(`🧩 Player ${playerName} is not a clan member. Command ignored.`);
                    return;
                }

                await command.execute(log, pool, config); // Pass the full log object to the command
            } else {
                console.log(`🧩 Unknown command: ${commandTrigger}`);
            }
        } catch (error) {
            console.error("🧩 Error processing chat log:", error);
        }
    };

    // Subscribe to the `CHAT` action in the log stream
    logStreamManager.subscribe("CHAT");

    logStreamManager.on("CHAT", async (log) => {
        try {
            console.log(`🧩 Received CHAT log: ${JSON.stringify(log, null, 2)}`);
            await processChatLog(log);
        } catch (error) {
            console.error("🧩 Error processing CHAT log:", error);
        }
    });

    console.log("🧩 Custom Commands module initialized.");
}
