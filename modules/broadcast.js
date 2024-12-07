const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

module.exports = (client, pool, config) => {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isCommand()) return;

        const { commandName, options, channelId } = interaction;

        // Ensure only relevant commands are processed
        if (commandName !== "broadcast" || channelId !== config.channelID) return;

        const messageToSend = options.getString("message");

        try {
            // Fetch all online players
            const playersData = await api.get_players();
            const players = playersData.result || [];

            if (players.length === 0) {
                return interaction.reply("No players to broadcast to.");
            }

            // Batch player IDs and process messages
            const playerIds = players.map(player => player.player_id);
            const batchSize = 50;
            let successCount = 0;
            let failedMessages = [];

            for (let i = 0; i < playerIds.length; i += batchSize) {
                const batch = playerIds.slice(i, i + batchSize);

                for (const playerId of batch) {
                    try {
                        await api.message_player({
                            player_id: playerId,
                            message: messageToSend,
                            by: interaction.user.username,
                            save_message: false,
                        });
                        successCount++;
                    } catch (err) {
                        failedMessages.push({ player_id: playerId, error: err.message });
                    }
                }

                // Introduce delay between batches to avoid overwhelming the system
                if (i + batchSize < playerIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay
                }
            }

            // Build reply message
            let replyMessage = `Broadcast sent to ${successCount} players.`;
            if (failedMessages.length > 0) {
                replyMessage += `\nFailed for ${failedMessages.length} players. See logs for details.`;
                logger.error("Broadcast failed messages:", failedMessages);
            }

            await interaction.reply(replyMessage);
        } catch (error) {
            logger.error("🧩 Error sending broadcast message:", error);
            await interaction.reply("Failed to send broadcast message. Please try again.");
        }
    });
};
