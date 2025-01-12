const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;

const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const isCommand = (log) => {
    if (!log.sub_content) return { isCommand: false, symbol: "", content: "" };
    if (log.sub_content.startsWith("!") || log.sub_content.startsWith("@")) {
        // Return the command symbol and the log for further checks
        return {
            result: true,
            symbol: log.sub_content[0], // `!` or `@`
            content: log.sub_content.slice(1) // Remove the symbol but keep everything else
        };
    }
    return { result: false};
};

const isAdminping = (log) => {
    const result = {
        result: false, // Whether it's an admin ping
        message: ""    // Remaining content of the command
    };
    // First, check if it's a command
    const commandCheck = isCommand(log);
    if (!commandCheck.result) return false;

    // Extract the word after the command symbol
    const [firstWord, ...rest] = commandCheck.content.split(/\s+/); // Split by whitespace
    const restOfContent = rest.join(" "); // Combine the remaining words

    if (['admin', 'moderator', 'report'].includes(firstWord.toLowerCase())) {
        return {
            result: true,
            message: restOfContent // Exclude the admin tag
        };
    }

    return result;
};

const isWatched = async (log) => {
    const result = {
        result: false, // Whether it's a watched player
        player_id: "", // Player ID of the player
        player_name: "", // Name of the player
        reason: "none" //  Reason for being watched
    };

    const player = await api.get_player_profile({ player_id: log.player_id_1 })
        .then(player => {
            if (player?.watchlist?.is_watched) {
                result.result = true;
                result.player_id = log.player_id_1;
                result.player_name = player.name;
                result.reason = player.watchlist.reason;
            }
        })
        .catch(error => console.error("Failure feching player profile", error))
    return result;
}

module.exports = {
    isCommand,
    isAdminping,
    isWatched
};