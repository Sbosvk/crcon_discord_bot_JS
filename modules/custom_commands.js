const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Array to define custom commands
const commands = [
    //=================SWITCH TEAM=================
    {
        trigger: "change", // Trigger word for the command
        isClanOnly: true,  // Only allow command for clan members
        execute: async (playerName, db, config, webhook) => {
            console.log("custom_commands", JSON.stringify(webhook.embeds[0].author));
            // try {
            //     // Fetch detailed player information to find the current team of the player
            //     const detailedPlayers = await api.get_detailed_players();
            //     const players = detailedPlayers.result.players;
            //     // const playerSteamID = extractSteamIDFromWebhook(webhook);
            //     // const playerInfo = players[playerSteamID];


            //     if (!playerInfo) {
            //         console.log('custom_commands', `Player ${playerName} not found in detailed players.`);
            //         return;
            //     }
            //     // playerName.trim();
            //     // if (playerName.contains('[Allies][Team]')) {
            //     //     console.log("custom_commands", "Team is allies")
            //     //     playerName = playerName.split("[Allies]")[0];
            //     // } else {
            //     //     playerName = playerName.split("[Axis]")[0];
            //     // }
            //     // console.log("custom_commands", `New name is '${playerName}'`)

            //     const currentTeam = playerInfo.team;  // "axis" or "allies"
            //     const oppositeTeam = currentTeam === "axis" ? "allies" : "axis";  // Determine the opposite team

            //     // Get public information to check player counts and max players allowed per team
            //     const publicInfo = await api.get_public_info();
            //     const maxPlayersPerTeam = publicInfo.result.max_player_count / 2; // Max players per team
            //     const playerCounts = publicInfo.result.player_count_by_team;

            //     const teamFull = playerCounts[oppositeTeam] >= maxPlayersPerTeam;

            //     if (teamFull) {
            //         // Inform the player that the opposite team is full
            //         await api.message_player({
            //             player_name: playerName,
            //             player_id: playerSteamID,
            //             message: `Sorry ${playerName}, but the ${oppositeTeam} team is currently full.`,
            //             by: "Server",
            //             save_message: false,
            //         });
            //         console.log('custom_commands', `Player ${playerName} attempted to switch to ${oppositeTeam}, but the team was full.`);
            //     } else {
            //         // Switch the player to the opposite team
            //         const switchResult = await api.switch_player_now({
            //             player_name: playerName,
            //         });

            //         if (switchResult.result) {
            //             console.log('custom_commands', `Player ${playerName} switched to ${oppositeTeam} team successfully.`);
            //         } else {
            //             console.log('custom_commands', `Failed to switch ${playerName} to ${oppositeTeam}.`);
            //         }
            //     }
            // } catch (error) {
            //     console.error('custom_commands', `Error executing 'change' command for ${playerName}:`, error);
            // }
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
const processChatWebhook = (data, db, config) => {
    const embed = data.embeds[0];
    const playerMessage = embed.description;
    const playerName = embed.author.name;

    console.log('custom_commands', "Chat Webhook Data Received:", data);

    // Check if the message starts with '!' or '@' and is a command
    if (playerMessage.startsWith("!") || playerMessage.startsWith("@")) {
        const [commandTrigger, ...args] = playerMessage.substring(1).split(" ");
        const command = commands.find((cmd) => cmd.trigger === commandTrigger);

        if (command) {
            // If the command is restricted to clan members, check if the player is a clan member
            if (command.isClanOnly && !isClanMember(playerName, config)) {
                console.log('custom_commands', `Player ${playerName} is not a clan member. Command ignored.`);
                return; // Exit without executing the command
            }

            // Execute the command, passing playerName, args, and common resources like db, config, data
            command.execute(playerName, args, db, config, data);
        } else {
            console.log('custom_commands', `Unknown command: ${commandTrigger}`);
        }
    }
};

// Native webhook handler
const nativeWebhook = (data, config, db) => {
    processChatWebhook(data, db, config);
};

module.exports = (client, db, config) => {
    if (config.webhook) {
        console.log("custom_commands", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, db),
        };
    }
};
