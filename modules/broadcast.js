const API = require("crcon.js");
require("dotenv").config();
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

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
            // Confirmation prompt with buttons
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("cancel_broadcast")
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId("confirm_broadcast")
                    .setLabel("Confirm")
                    .setStyle(ButtonStyle.Success)
            );

            const confirmationMessage = await interaction.reply({
                content: `Are you sure you want to broadcast this message to all players?\n\n**"${messageToSend}"**`,
                components: [row],
                ephemeral: true,
                fetchReply: true,
            });

            // Create collector for confirmation or cancellation
            const filter = (i) =>
                ["confirm_broadcast", "cancel_broadcast"].includes(i.customId) &&
                i.user.id === interaction.user.id;

            const collector = confirmationMessage.createMessageComponentCollector({
                filter,
                time: 15000, // 15 seconds timeout
            });

            collector.on("collect", async (buttonInteraction) => {
                if (buttonInteraction.customId === "confirm_broadcast") {
                    await buttonInteraction.update({
                        content: "Broadcast confirmed! Sending message...",
                        components: [],
                    });

                    await sendBroadcastMessage(api, interaction, messageToSend);
                } else if (buttonInteraction.customId === "cancel_broadcast") {
                    await buttonInteraction.update({
                        content: "Broadcast cancelled.",
                        components: [],
                    });
                }
            });

            collector.on("end", async (collected) => {
                if (collected.size === 0) {
                    await confirmationMessage.edit({
                        content: "Broadcast confirmation timed out. Message was **not sent**.",
                        components: [],
                    });
                }
            });
        } catch (error) {
            console.error("🧩 Error handling broadcast confirmation:", error);
            await interaction.reply("An error occurred while processing your request.");
        }
    });
};

// Helper function to send the broadcast
const sendBroadcastMessage = async (api, interaction, messageToSend) => {
    try {
        // Fetch all online players
        const playersData = await api.get_players();
        const players = playersData.result || [];

        if (players.length === 0) {
            return interaction.followUp("No players to broadcast to.");
        }

        const playerIds = players.map((player) => player.player_id);
        const batchSize = 50;
        let successCount = 0;
        let failedMessages = [];

        for (let i = 0; i < playerIds.length; i += batchSize) {
            const batch = playerIds.slice(i, i + batchSize);

            // Use Promise.allSettled for concurrent execution
            const results = await Promise.allSettled(
                batch.map((playerId) =>
                    api.message_player({
                        player_id: playerId,
                        message: messageToSend,
                        by: interaction.user.username,
                        save_message: false,
                    })
                )
            );

            // Process results
            results.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    successCount++;
                } else {
                    failedMessages.push({
                        player_id: batch[index],
                        error: result.reason.message || "Unknown error",
                    });
                }
            });

            // Delay between batches
            if (i + batchSize < playerIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 5000)); // 5-second delay
            }
        }

        // Build reply message
        let replyMessage = `Broadcast sent to ${successCount} players.`;
        if (failedMessages.length > 0) {
            replyMessage += `\nFailed for ${failedMessages.length} players. Check logs for details.`;
            console.error("Broadcast failed messages:", failedMessages);
        }

        await interaction.followUp(replyMessage);
    } catch (error) {
        console.error("🧩 Error sending broadcast message:", error);
        await interaction.followUp("Failed to send broadcast message. Please try again.");
    }
};
