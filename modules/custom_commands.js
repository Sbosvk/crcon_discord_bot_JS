const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Array to define custom commands
const commands = [
    {
        trigger: "change", // Trigger word for the command
        isClanOnly: true,  // Only allow command for clan members
        execute: async (playerName, team, playerProfileUrl, db, config, webhook) => {
            try {
                const public_info = await api.get_public_info();
                const maxPlayersPerTeam = 50;
                
                // Check team size, assuming result returns player counts per team
                const teamCounts = public_info.result.team_player_counts;
                const teamFull = teamCounts[team] >= maxPlayersPerTeam;

                if (teamFull) {
                    // Send message to the player that the team is full
                    await api.message_player({
                        player_name: playerName,
                        player_id: extractSteamIDFromURL(playerProfileUrl),
                        message: `Sorry ${playerName}, but the ${team} team is currently full.`,
                        by: "Server",
                        save_message: false,
                    });
                    console.log(`Player ${playerName} attempted to switch to ${team}, but the team was full.`);
                } else {
                    // Execute the team change
                    const switchResult = await api.switch_player_now({
                        player_name: playerName,
                    });

                    if (switchResult.result) {
                        console.log(`Player ${playerName} switched to ${team} team successfully.`);
                    } else {
                        console.log(`Failed to switch ${playerName} to ${team}.`);
                    }
                }
            } catch (error) {
                console.error(`Error executing 'change' command for ${playerName}:`, error);
            }
        },
    },
];

// Function to extract SteamID from a player's profile URL
function extractSteamIDFromURL(url) {
    const match = url.match(/\/profiles\/(\d+)/);
    return match ? match[1] : null;
}

// Function to process incoming webhook data
const processChatWebhook = (data, db, config) => {
    const embed = data.embeds[0];
    const playerMessage = embed.description;
    const playerName = embed.author.name;
    const playerProfileUrl = embed.author.url;

    console.log("Chat Webhook Data Received:", data);

    // Ensure the player is a clan member (check for specific prefix in player name)
    const clanPrefix = config.clanPrefix || "[1stA]"; // Example clan prefix
    const isClanMember = playerName.startsWith(clanPrefix);

    if (!isClanMember) {
        console.log(`Player ${playerName} is not a clan member. Ignoring command.`);
        return;
    }

    // Check if the message starts with '!' or '@' and is a command
    if (playerMessage.startsWith("!") || playerMessage.startsWith("@")) {
        const [commandTrigger, ...args] = playerMessage.substring(1).split(" ");
        const command = commands.find((cmd) => cmd.trigger === commandTrigger);

        if (command) {
            // Execute the command
            command.execute(playerName, args[0], playerProfileUrl, db, config, data);
        } else {
            console.log(`Unknown command: ${commandTrigger}`);
        }
    }
};

const nativeWebhook = (data, config, db) => {
    // console.log("Chat Webhook Data Received:", data);
    processChatWebhook(data, db, config);
};

module.exports = (client, db, config) => {
    if (config.webhook) {
        console.log("custom_command", "Using native webhook mode.");
        return {
            processWebhookData: (data) => nativeWebhook(data, config, db),
        };
    }
};
