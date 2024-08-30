const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

module.exports = (client, db, config) => {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isCommand()) return;

        const { commandName, options, channelId } = interaction;
        // Ensure only relevant commands are processed
        if (interaction.commandName !== "broadcast") {
            return; // Return early if the command is not for this module
        }
        console.log("Broadcast: Received command", interaction.commandName);

        if (commandName === 'broadcast' && channelId === config.channelID) {
            const messageToSend = options.getString('message');

            try {
                // Fetch all online players
                const playersData = await api.get_players();
                const players = playersData.result || [];

                // Collect all player IDs
                const playerIds = players.map(player => player.player_id);

                // Send the message to each player
                for (const playerId of playerIds) {
                    await api.message_player({
                        player_id: playerId,
                        message: messageToSend,
                        by: interaction.user.username,
                        save_message: false
                    });
                }

                await interaction.reply(`Broadcast message sent to ${playerIds.length} players.`);
            } catch (error) {
                console.error("Broadcast Module", "Error sending broadcast message:", error);
                await interaction.reply("Failed to send broadcast message.");
            }
        }
    });
};
