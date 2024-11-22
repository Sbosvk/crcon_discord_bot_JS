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
    }).then(async () => {
        let expirationDate = newExpiration.split("T")[0];
        let expirationTime = newExpiration.split("T")[1].split("+")[0];
        await api.message_player({
            player_id: player.player_id,
            message: "Thank you for helping seed the server! <3\n\n" +
            "As a token of appreciation you have been rewarded with VIP status until:\n" +
            `${expirationDate} ${expirationTime} UTC`
        })
    });

    console.log(`Granted VIP to ${player.name} until ${newExpiration}`);
};

const { EmbedBuilder } = require("discord.js");

// Helper Function to Assign VIP Durations
const assignVipDurations = (vipDurationHours, vipGrantCount) => {
    if (Array.isArray(vipDurationHours)) {
        const uniqueDurations = [...vipDurationHours]; // Clone array to avoid mutating the original
        if (uniqueDurations.length < vipGrantCount) {
            console.warn(
                "Seed VIP: Not enough unique VIP durations for all players. Reducing VIP grant count to match durations."
            );
            vipGrantCount = uniqueDurations.length; // Adjust the grant count
        }
        // Shuffle and take the required number of durations
        const shuffled = uniqueDurations.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, vipGrantCount);
    } else {
        // Parse single value (number or string) into an integer
        const duration = parseInt(vipDurationHours, 10);
        if (isNaN(duration)) {
            throw new Error("Invalid vipDurationHours: Must be a number, string, or array.");
        }
        return Array(vipGrantCount).fill(duration); // Assign the same duration to all players
    }
};

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

                if (!lastGrant || now - lastGrant.timestamp > cooldownPeriod) {
                    const players = await api.get_players();
                    console.log("Total players fetched:", players.result.length);
                    const activePlayers = players.result.filter(
                        (player) => player.profile.current_playtime_seconds >= requiredActivityMinutes * 60 // Convert minutes to seconds
                    );
                    console.log("Active players after filtering:", activePlayers.length, activePlayers.map((p) => p.name));

                    // Fetch current VIPs
                    const currentVIPs = await api.get_vip_ids();
                    const vipList = currentVIPs.result;

                    // Filter out lifetime VIPs and existing VIPs
                    const eligiblePlayers = activePlayers.filter(
                        (player) =>
                            !vipList.some(
                                (vip) =>
                                    vip.player_id === player.player_id &&
                                    vip.vip_expiration &&
                                    isLifetimeVIP(vip)
                            )
                    );
                    console.log(
                        "Eligible players after VIP check:",
                        eligiblePlayers.length,
                        eligiblePlayers.map((p) => p.name)
                    );

                    // Pick random players from eligible players based on vipGrantCount
                    const selectedPlayers = eligiblePlayers
                        .sort(() => Math.random() - 0.5) // Shuffle the array
                        .slice(0, vipGrantCount); // Select N random players
                    console.log("Selected players for VIP:", selectedPlayers.map((p) => p.name));

                    // Determine VIP durations
                    const durations = assignVipDurations(vipDurationHours, selectedPlayers.length);
                    console.log("Assigned VIP durations:", durations);

                    // Grant VIP to each selected player with their respective durations
                    for (let i = 0; i < selectedPlayers.length; i++) {
                        const player = selectedPlayers[i];
                        const duration = durations[i];
                        await grantVIP(player, duration);
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
                            .setDescription("The following players have been granted VIP status:");

                        const playerDetails = selectedPlayers.map(
                            (p, i) => `**${p.name}** - ${durations[i]} hours`
                        );

                        // Add player details to the embed
                        embed.addFields({ name: "VIP Players", value: playerDetails.join("\n") });

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
