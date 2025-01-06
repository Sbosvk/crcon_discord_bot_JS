const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

module.exports = (client, pool, config) => {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isCommand() || interaction.commandName !== 'adminping') return;

        const messageToSend = interaction.options.getString('message');

        try {
            // Fetch online mods from the API
            const modData = await api.get_ingame_mods();
            const onlineMods = modData.result || [];

            if (onlineMods.length === 0) {
                await interaction.reply("No in-game admins are currently online.");
                return;
            }

            let successCount = 0;
            let failedMessages = [];

            for (const mod of onlineMods) {
                try {
                    const response = await api.message_player({
                        player_name: mod.name,
                        player_id: mod.player_id,
                        message: messageToSend,
                        by: interaction.user.username,
                        header: "Admin Ping"
                    });

                    if (response) {
                        successCount++;
                    } else {
                        failedMessages.push(mod.name);
                    }
                } catch (error) {
                    console.error(`🧩 Failed to send message to ${mod.name}:`, error);
                    failedMessages.push(mod.name);
                }
            }

            let replyMessage = `Message sent to ${successCount} in-game admins.`;
            if (failedMessages.length > 0) {
                replyMessage += `\nFailed to send to: ${failedMessages.join(", ")}`;
            }

            await interaction.reply(replyMessage);
        } catch (error) {
            console.error("🧩 Error processing /adminping command:", error);
            await interaction.reply("Failed to send message to in-game admins. Please try again.");
        }
    });
};
