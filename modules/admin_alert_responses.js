const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const RCON_API_URL = process.env.CRCON_API_URL;
const api = new API(RCON_API_URL, { token: CRCON_API_TOKEN });

const { MessageType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = (client, db, config) => {
    client.on("messageCreate", async (message) => {
        if (message.type === MessageType.Reply && message.channelId === config.channelID) {
            const refMessage = await message.fetchReference();
            if (refMessage && refMessage.embeds.length > 0) {
                const embed = refMessage.embeds[0];
                if (embed.author && embed.author.url) {
                    const steamId64 = extractSteamIDFromURL(embed.author.url);
                    if (steamId64) {
                        try {
                            // Create a confirmation button
                            const row = new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId("fuckno")
                                    .setLabel("Fuck no!")
                                    .setStyle(ButtonStyle.Danger),

                                new ButtonBuilder()
                                    .setCustomId("confirm")
                                    .setLabel("Confirm")
                                    .setStyle(ButtonStyle.Success)
                            );

                            // Send a confirmation prompt
                            const confirmationMessage = await message.reply({
                                content: "Are you really fucking sure you want to send this message to that player?!\n"
                                + "_._._._._._._._._._._._._._._._._._._._\n"
                                + `*${message.content}*`,
                                components: [row],
                            });

                            // Create a message collector to wait for button interaction
                            const filter = (interaction) =>
                                ["confirm", "fuckno"].includes(interaction.customId) &&
                                interaction.user.id === message.author.id;

                            const collector = confirmationMessage.createMessageComponentCollector({
                                filter,
                                time: 15000, // 15 seconds
                            });

                            collector.on("collect", async (interaction) => {
                                if (interaction.customId === "confirm") {
                                    try {
                                        const response = await api.do_message_player(
                                            null,
                                            steamId64,
                                            message.content,
                                            message.author.username,
                                            false
                                        );

                                        if (response.result && response.result.toLowerCase() == "success") {
                                            await interaction.update({
                                                content: "Admin message sent successfully!",
                                                components: [],
                                            });
                                        } else {
                                            if (response.result == null) response.statusText = "Player might be offline."
                                            await interaction.update({
                                                content: `Failed to send admin ping: **${response.statusText}**`,
                                                components: [],
                                            });
                                        }
                                    } catch (error) {
                                        await interaction.update({
                                            content: "Failed to send message due to an error.",
                                            components: [],
                                        });
                                        console.error(error);
                                    }
                                }
                                if (interaction.customId === "fuckno") {
                                    await interaction.update({
                                        content: "Phew, glad we chickened out of that one! 🐔",
                                        components: [],
                                    })
                                }
                            });

                            collector.on("end", async (collected) => {
                                if (collected.size === 0) {
                                    await confirmationMessage.edit({
                                        content: "Message confirmation timed out. Message was **not sent**.",
                                        components: [],
                                    });
                                }
                            });
                        } catch (error) {
                            await message.reply("Failed to send confirmation prompt.");
                            console.error(error);
                        }
                    } else {
                        await message.reply("Could not find a valid Steam profile link in the referenced message.");
                    }
                }
            }
        }
    });

    function extractSteamIDFromURL(url) {
        const match = url.match(/\/profiles\/(\d+)/);
        return match ? match[1] : null;
    }
};