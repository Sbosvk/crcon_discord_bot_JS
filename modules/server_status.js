const { Client, EmbedBuilder } = require("discord.js");
const API = require("crcon.js");
require("dotenv").config();
const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const RCON_API_URL = process.env.CRCON_API_URL;
const api = new API(RCON_API_URL, { token: CRCON_API_TOKEN });

const setupServerStatus = (client, db, config) => {
    const channelID = config.channelID;

    const mapImages = {
        // Map names and their respective image URLs
        carentan:
            "https://static.wikia.nocookie.net/hellletloose/images/3/34/%28official%29_carentan.png/revision/latest?cb=20201227220456",
        car_s: this.carentan,
        driel: "https://static.wikia.nocookie.net/hellletloose/images/6/6b/Driel.png/revision/latest/scale-to-width-down/1000?cb=20230912234719",
        elalamein:
            "https://static.wikia.nocookie.net/hellletloose/images/1/18/El-alamein.png/revision/latest/scale-to-width-down/1000?cb=20230912234732",
        foy: "https://static.wikia.nocookie.net/hellletloose/images/e/eb/Foy_1.jpg/revision/latest/scale-to-width-down/1000?cb=20200408233012",
        hill400:
            "https://static.wikia.nocookie.net/hellletloose/images/d/dc/Hell_Let_Loose_Hill-400.jpg/revision/latest/scale-to-width-down/1000?cb=20200501095929",
        hurtgenforest:
            "https://static.wikia.nocookie.net/hellletloose/images/7/7a/%28official%29hurtgen_forest.jpg/revision/latest/scale-to-width-down/1000?cb=20201227221135",
        kharkov:
            "https://static.wikia.nocookie.net/hellletloose/images/f/f2/Kharkov.png/revision/latest/scale-to-width-down/1000?cb=20221025152907",
        kursk: "https://static.wikia.nocookie.net/hellletloose/images/e/e6/Kursk_house_and_forest.jpg/revision/latest/scale-to-width-down/1000?cb=20210727091634",
        mortain:
            "https://static.wikia.nocookie.net/hellletloose/images/0/08/Mortain_1.jpg/revision/latest/scale-to-width-down/1000?cb=20240117023136",
        omahabeach:
            "https://static.wikia.nocookie.net/hellletloose/images/c/cc/Omaha_Beach_1.jpg/revision/latest/scale-to-width-down/1000?cb=20200409023230",
        purpleheartlane:
            "https://static.wikia.nocookie.net/hellletloose/images/e/e5/Purple_Heart_Lane_2.jpg/revision/latest/scale-to-width-down/1000?cb=20200409030954",
        remagen:
            "https://static.wikia.nocookie.net/hellletloose/images/2/20/Remagen.png/revision/latest/scale-to-width-down/1000?cb=20221017234030",
        stalingrad:
            "https://static.wikia.nocookie.net/hellletloose/images/1/1f/SG10.png/revision/latest/scale-to-width-down/1000?cb=20210626125524",
        stmariedumont:
            "https://static.wikia.nocookie.net/hellletloose/images/a/ad/HLL_SMdM_screenshot_1.jpg/revision/latest/scale-to-width-down/1000?cb=20190322085547",
        stmereeglise:
            "https://static.wikia.nocookie.net/hellletloose/images/3/31/Sainte-M%C3%A8re-%C3%88glise_2.jpg/revision/latest/scale-to-width-down/1000?cb=20200409011533",
        utahbeach:
            "https://static.wikia.nocookie.net/hellletloose/images/0/07/Utah_Beach_1.jpg/revision/latest/scale-to-width-down/1000?cb=20200409020043",
    };

    mapImages.car_s = mapImages.carentan;
    mapImages.sme_s = mapImages.stmereeglise;
    mapImages.drl_s = mapImages.driel;
    mapImages.ela_s = mapImages.elalamein;
    mapImages.smdm_s = mapImages.stmariedumont;

    const offensiveEmojis = {
        // Offensive types and their emojis
        us: ":flag_us:",
        ger: ":flag_de:",
        cw: ":flag_gb:",
        rus: ":flag_ru:",
    };

    async function fetchServerInfo() {
        try {
            const data = await api.get_public_info();
            return data.result;
        } catch (error) {
            console.error("Failed to fetch server info:", error);
            return null;
        }
    }

    async function fetchDetailedPlayers() {
        try {
            const response = await api.get_detailed_players();
            return response.result.players;
        } catch (error) {
            console.error("Failed to fetch detailed players:", error);
            return null;
        }
    }

    function findTopPlayers(players) {
        let topCombat = null,
            topDefense = null,
            mostSupport = null;
        let maxCombat = -1,
            maxDefense = -1,
            maxSupport = -1;

        for (const playerID in players) {
            const player = players[playerID];
            const { combat = 0, defense = 0, support = 0 } = player;

            if (combat > maxCombat) {
                maxCombat = combat;
                topCombat = player;
            }
            if (defense > maxDefense) {
                maxDefense = defense;
                topDefense = player;
            }
            if (support > maxSupport) {
                maxSupport = support;
                mostSupport = player;
            }
        }

        return { topCombat, topDefense, mostSupport };
    }

    function getImageUrlForMap(mapName) {
        if (!mapName) {
            console.error("Map name is undefined");
            return null;
        }

        for (const baseName in mapImages) {
            if (mapName.toLowerCase().includes(baseName)) {
                return mapImages[baseName];
            }
        }
        return null;
    }

    function getOffensiveEmojis(mapName) {
        for (const key in offensiveEmojis) {
            if (mapName.toLowerCase().includes(`offensive_${key}`)) {
                return key === "ger"
                    ? [offensiveEmojis[key], offensiveEmojis["us"]]
                    : [offensiveEmojis["us"], offensiveEmojis[key]];
            }
        }
        return ["", ""]; // Default if no offensive type is found
    }

    function parseTimeRemaining(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}:${m.toString().padStart(2, "0")}:${s
            .toString()
            .padStart(2, "0")}`;
    }

    function checkTimeRemaining(timeInSeconds) {
        return timeInSeconds > 0; // True if time remaining is not "00:00:00"
    }

    function checkForMapVotes(timeInSeconds) {
        return timeInSeconds < 120; // True if less than 2 minutes remaining
    }

    async function createStatusEmbed(info) {
        const players = await fetchDetailedPlayers();
        const { topCombat, topDefense, mostSupport } = findTopPlayers(players);

        // Extract the image URL using the new map name structure
        const imageUrl = getImageUrlForMap(info.current_map.map.id);

        let humanMapName = info.current_map.map.pretty_name;

        const gameMode = info.current_map.map.game_mode;
        const [attackerEmoji, defenderEmoji] = getOffensiveEmojis(
            info.current_map.map.id
        );

        const mapNotStarted = !checkTimeRemaining(info.time_remaining);
        const showVotes = checkForMapVotes(info.time_remaining);
        const playerCountEmoji =
            info.player_count < 1
                ? ""
                : info.player_count <= 39
                ? ":seedling:"
                : ":blossom:";

        const performerFields = [];
        if (topCombat) {
            performerFields.push({
                name: "Top Combat",
                value: `${topCombat.name}: ${topCombat.combat} points`,
                inline: true,
            });
        }
        if (topDefense) {
            performerFields.push({
                name: "Top Defense",
                value: `${topDefense.name}: ${topDefense.defense} points`,
                inline: true,
            });
        }
        if (mostSupport) {
            performerFields.push({
                name: "Most Support",
                value: `${mostSupport.name}: ${mostSupport.support} points`,
                inline: true,
            });
        }

        let battleStatus = "";
        if (info.score.axis > info.score.allied) {
            battleStatus = ":dagger: :red_circle:";
        } else if (info.score.allied > info.score.axis) {
            battleStatus = ":dagger: :blue_circle:";
        } else battleStatus = ":red_circle: :crossed_swords: :blue_circle:";

        const embed = new EmbedBuilder()
            .setTitle(info.name.name)
            .setDescription(
                `Current Map: **${humanMapName}**\n` +
                    `Game Mode: **${gameMode}** ${
                        gameMode.toLowerCase() === "offensive"
                            ? attackerEmoji + " vs " + defenderEmoji
                            : ""
                    }\n` +
                    `Player Count: **${info.player_count}/${info.max_player_count}** ${playerCountEmoji}\n\n` +
                    `Allied Players: **${info.player_count_by_team.allied}**\n` +
                    `Axis Players: **${info.player_count_by_team.axis}**\n\n` +
                    (mapNotStarted
                        ? "The match has not started yet. Waiting for seeders.\n"
                        : `Time Remaining: ${parseTimeRemaining(
                              info.time_remaining
                          )}`) +
                    (showVotes && info.time_remaining !== 0
                        ? `Total Votes: ${
                              info.vote_status.total_votes
                          }\nWinning Maps: ${info.vote_status
                              .map((vote) => vote.map.pretty_name)
                              .join(", ")}\n`
                        : "")
            )
            .setColor(info.score.axis > info.score.allied ? 0xff0000 : 0x0000ff)
            .setImage(imageUrl)
            .setTimestamp()
            .addFields(
                { name: "Axis", value: `${info.score.axis}`, inline: true },
                {
                    name: "Battle Status",
                    value: `${battleStatus}`,
                    inline: true,
                },
                { name: "Allied", value: `${info.score.allied}`, inline: true }
            )
            .addFields(performerFields)
            .setFooter({ text: "Server Status" });

        return embed;
    }

    async function updateStatusMessage() {
        const channel = await client.channels.fetch(channelID);
        if (!channel) {
            console.error(`Channel with ID ${channelID} not found.`);
            return;
        }

        const info = await fetchServerInfo();
        if (!info) {
            console.error("No server info available.");
            return;
        }

        const embed = await createStatusEmbed(info);

        // Fetch the last message in the channel (assuming it's the status message)
        const messages = await channel.messages.fetch({ limit: 1 });
        const lastMessage = messages.first();

        if (lastMessage && lastMessage.author.id === client.user.id) {
            await lastMessage.edit({ embeds: [embed] });
        } else {
            await channel.send({ embeds: [embed] });
        }
    }

    // Start an interval to update the status message every 5 seconds
    setInterval(updateStatusMessage, config.updateInterval * 1000);
};

module.exports = setupServerStatus;
