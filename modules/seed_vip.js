const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const { EmbedBuilder } = require("discord.js");

// Helper functions to add time to the current expiration date
const addHoursToDate = (date, hours) => {
    const resultDate = new Date(date);
    resultDate.setHours(resultDate.getHours() + hours);
    return resultDate.toISOString();
};

// Fetch the last VIP grant timestamp
const getLastVIPGrant = async (pool) => {
    const result = await pool.query("SELECT value->>'timestamp' AS timestamp FROM seed_vip WHERE key = $1", ["lastVIPGrant"]);
    return result.rows[0]?.timestamp ? parseInt(result.rows[0].timestamp, 10) : null;
};

// Update the last VIP grant timestamp
const updateLastVIPGrant = async (pool, timestamp) => {
    const query = `
        INSERT INTO seed_vip (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value;
    `;
    await pool.query(query, ["lastVIPGrant", { timestamp }]);
};

// Check if the player has a lifetime VIP
const isLifetimeVIP = (player) => player.vip_expiration === "3000-01-01T00:00:00+00:00";

// Grant VIP with extended expiration
const grantVIP = async (player, vipDurationHours) => {
    const currentExpiration = new Date(player.vip_expiration || Date.now());
    const newExpiration = addHoursToDate(currentExpiration, vipDurationHours);

    await api.add_vip({
        player_id: player.player_id,
        description: "Seed VIP",
        expiration: newExpiration,
    });

    const expirationDate = newExpiration.split("T")[0];
    const expirationTime = newExpiration.split("T")[1].split("+")[0];
    await api.message_player({
        player_id: player.player_id,
        message: `Thank you for helping seed the server! <3\n\n` +
            `As a token of appreciation, you have been rewarded with **${vipDurationHours} hours** of VIP status.\n` +
            `Enjoy your time as a VIP and thanks for contributing!`,
    });

    console.log("🧩", `Granted VIP to ${player.name} until ${newExpiration}`);
};

// Assign VIP durations
const assignVipDurations = (vipDurationHours, vipGrantCount) => {
    if (Array.isArray(vipDurationHours)) {
        const uniqueDurations = [...vipDurationHours];
        if (uniqueDurations.length < vipGrantCount) {
            console.warn("🧩", "Not enough unique durations. Adjusting grant count.");
            vipGrantCount = uniqueDurations.length;
        }
        return uniqueDurations.sort(() => Math.random() - 0.5).slice(0, vipGrantCount);
    } else {
        const duration = parseInt(vipDurationHours, 10);
        if (isNaN(duration)) throw new Error("Invalid vipDurationHours: Must be a number, string, or array.");
        return Array(vipGrantCount).fill(duration);
    }
};

// Main function to handle seeding
module.exports = async (client, pool, config) => {
    const requiredActivityMinutes = config.requiredActivityMinutes;
    const vipDurationHours = config.vipDurationHours;
    const checkIntervalSeconds = config.checkIntervalSeconds;
    const cooldownPeriod = config.cooldownPeriodHours * 60 * 60 * 1000;
    const vipGrantCount = config.vipGrantCount;

    const makeCheck = async (retryCount = 0) => {
        try {
            const publicInfo = await api.get_public_info();
            const playerCount = publicInfo.player_count;

            const seedConfig = await api.get_auto_mod_seeding_config();
            const maxPlayers = seedConfig.enforce_cap_fight.max_players;

            if (playerCount >= maxPlayers) {
                const now = Date.now();
                const lastGrant = await getLastVIPGrant(pool);

                if (!lastGrant || now - lastGrant > cooldownPeriod) {
                    const players = await api.get_players();
                    const activePlayers = players.filter(
                        (player) => player.profile.current_playtime_seconds >= requiredActivityMinutes * 60
                    );

                    const vipList = await api.get_vip_ids();

                    const eligiblePlayers = activePlayers.filter(
                        (player) => !vipList.some(
                            (vip) => vip.player_id === player.player_id && isLifetimeVIP(vip)
                        )
                    );

                    const selectedPlayers = eligiblePlayers
                        .sort(() => Math.random() - 0.5)
                        .slice(0, vipGrantCount);

                    const durations = assignVipDurations(vipDurationHours, selectedPlayers.length);

                    for (let i = 0; i < selectedPlayers.length; i++) {
                        await grantVIP(selectedPlayers[i], durations[i]);
                    }

                    await updateLastVIPGrant(pool, now);

                    const channel = await client.channels.fetch(config.channelID);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor(0x00ff00)
                            .setTitle("🎉 Seed VIP Granted!")
                            .setDescription("The following players have been granted VIP status:")
                            .addFields({
                                name: "VIP Players",
                                value: selectedPlayers.map((p, i) => `**${p.name}** - ${durations[i]} hours`).join("\n"),
                            });

                        await channel.send({ embeds: [embed] });
                    }
                }
            }
        } catch (error) {
            console.error("🧩", "Check error", error);
            if (retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000;
                console.log("seed_vip", `Retrying in ${delay} ms... Attempt: ${retryCount + 1}`);
                setTimeout(() => makeCheck(retryCount + 1), delay);
            }
        }
    };

    setInterval(makeCheck, checkIntervalSeconds * 1000);
};