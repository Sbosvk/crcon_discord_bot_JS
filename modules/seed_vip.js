const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

// Helper functions to add time to the current expiration date
const addHoursToDate = (date, hours) => {
    const resultDate = new Date(date);
    resultDate.setHours(resultDate.getHours() + hours);
    return resultDate.toISOString();
};

// Fetch the current VIP expiration date for a player
const getExpirationForPlayer = (player) => {
    if (player.vip_expiration && player.vip_expiration !== null) {
        return new Date(player.vip_expiration); // Parse existing expiration date
    }
    return new Date(); // If no VIP, start from now
};

// Check if the player has a lifetime VIP
const isLifetimeVIP = (player) =>
    player.vip_expiration === "3000-01-01T00:00:00+00:00";

// Grant VIP with extended expiration
const grantVIP = async (player, vipDurationHours) => {
    // Calculate new expiration date based on current expiration or now
    const currentExpiration = getExpirationForPlayer(player);
    const newExpiration = addHoursToDate(currentExpiration, vipDurationHours);

    // Grant VIP with extended expiration
    await api.add_vip({
        player_id: player.player_id,
        description: "Seed VIP",
        expiration: newExpiration,
    });

    console.log(`Granted VIP to ${player.name} until ${newExpiration}`);
};

const { EmbedBuilder } = require("discord.js");

// Main function to handle seeding
const seedVIP = async (client, db, config) => {
    const requiredActivityMinutes = config.requiredActivityMinutes;
    const vipDurationHours = config.vipDurationHours;
    const checkIntervalSeconds = config.checkIntervalSeconds;
    const cooldownPeriod = config.cooldownPeriodHours * 60 * 60 * 1000; // Convert cooldown period to ms
    const vipGrantCount = config.vipGrantCount; // Number of players to grant VIP

    const makeCheck = async (retryCount = 0) => {
        try {
            const public_info = await api.get_public_info();
            const playerCount = public_info.result.player_count;

            // Get seeding configuration from CRCON API
            const seedConfig = await api.get_auto_mod_seeding_config();
            const maxPlayers = seedConfig.result.enforce_cap_fight.max_players;

            if (playerCount >= maxPlayers) {
                const now = Date.now();
                const lastGrant = await db.findOne({ key: "lastVIPGrant" });

                if (!lastGrant || (now - lastGrant.timestamp > cooldownPeriod)) {
                    const players = await api.get_players();
                    console.log("Total players fetched:", players.result.length);
                    const activePlayers = players.result.filter(
                        (player) => player.play_time >= requiredActivityMinutes * 60 // Convert minutes to seconds
                    );
                    console.log("Active players after filtering:", activePlayers.length, activePlayers.map(p => p.name));

                    // Fetch current VIPs
                    const currentVIPs = await api.get_vip_ids();
                    const vipList = currentVIPs.result;

                    // Filter out lifetime VIPs and existing VIPs
                    const eligiblePlayers = activePlayers.filter(
                        (player) => !vipList.some((vip) => {
                            return vip.player_id === player.player_id &&
                                vip.vip_expiration !== null && vip.vip_expiration !== undefined &&  // Ensure vip_expiration is valid
                                isLifetimeVIP(vip);  // Now it's safe to call isLifetimeVIP
                        })
                    );
                    console.log("Eligible players after VIP check:", eligiblePlayers.length, eligiblePlayers.map(p => p.name));

                    // Pick random players from eligible players based on vipGrantCount
                    const selectedPlayers = eligiblePlayers
                        .sort(() => 0.5 - Math.random()) // Shuffle the array
                        .slice(0, vipGrantCount); // Select N random players based on vipGrantCount
                        console.log("Selected players for VIP:", selectedPlayers.map(p => p.name));

                    // Grant VIP to each selected player
                    for (const player of selectedPlayers) {
                        await grantVIP(player, vipDurationHours);
                    }

                    // Update the timestamp for the last VIP grant
                    await db.update(
                        { key: "lastVIPGrant" },
                        { $set: { timestamp: now } },
                        { upsert: true }
                    );

                    // Notify players on Discord with EmbedBuilder
                    const channel = await client.channels.fetch(config.channelID);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor(0x00ff00)
                            .setTitle("🎉 Seed VIP Granted!")
                            .setDescription(
                                `The following players have been granted **${vipDurationHours} hours** of VIP status for helping seed the server:`
                            );

                        // Split the selected players into evenly distributed columns
                        const playerNames = selectedPlayers.map((p) => p.name);
                        const columnSize = Math.ceil(playerNames.length / 3);
                        const column1 = playerNames.slice(0, columnSize).join("\n") || "-";
                        const column2 = playerNames.slice(columnSize, columnSize * 2).join("\n") || "-";
                        const column3 = playerNames.slice(columnSize * 2).join("\n") || "-";

                        // Add columns to the embed
                        embed.addFields(
                            { name: `${vipDurationHours} hours VIP`, value: column1, inline: true },
                            { name: `${vipDurationHours} hours VIP`, value: column2, inline: true },
                            { name: `${vipDurationHours} hours VIP`, value: column3, inline: true }
                        );

                        // Send the embed message
                        await channel.send({ embeds: [embed] });
                    }
                }
            }
        } catch (error) {
            console.error("Seed VIP Error:", error);
            if (retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000;
                console.log(`Retrying in ${delay} ms... Attempt: ${retryCount + 1}`);
                setTimeout(() => makeCheck(retryCount + 1), delay);
            }
        }
    };

    setInterval(makeCheck, checkIntervalSeconds * 1000); // Schedule the check every X seconds
};

module.exports = seedVIP;
