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
            const data = await api.publicInfo();
            return data.result;
        } catch (error) {
            console.error("Failed to fetch server info:", error);
            return null;
        }
    }

    async function fetchDetailedPlayers() {
        try {
            const response = await api.getDetailedPlayers();
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

    function parseTimeRemaining(timeStr) {
        const parts = timeStr.split(":").map(Number);
        return parts[0] * 3600 + parts[1] * 60 + parts[2]; // Convert to total seconds
    }

    function checkTimeRemaining(timeStr) {
        const totalSeconds = parseTimeRemaining(timeStr);
        return totalSeconds !== 0; // True if time remaining is not "00:00:00"
    }

    function checkForMapVotes(timeStr) {
        const totalSeconds = parseTimeRemaining(timeStr);
        return totalSeconds < 120; // True if less than 2 minutes remaining
    }

    async function createStatusEmbed(info) {
        const players = await fetchDetailedPlayers();
        const { topCombat, topDefense, mostSupport } = findTopPlayers(players);

        // Fetch the image URL using the original map name before any cleanup
        const imageUrl = getImageUrlForMap(info.current_map.name);

        // Extract the game mode and clean the human-readable map name
        let gameMode = "Warfare"; // Default game mode
        const gameModes = ["Offensive", "Skirmish", "Warfare"];
        let humanMapName = info.current_map.human_name;
        gameModes.forEach((mode) => {
            if (humanMapName.includes(mode)) {
                gameMode = mode;
                humanMapName = humanMapName.replace(mode, "").trim(); // Clean and trim the map name
            }
        });

        const [attackerEmoji, defenderEmoji] = getOffensiveEmojis(
            info.current_map.name
        );
        const mapNotStarted = !checkTimeRemaining(info.raw_time_remaining);
        const showVotes = checkForMapVotes(info.raw_time_remaining);
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

        let alliedScore = 2;
        let axisScore = 2;
        if (info.score.axis == 5 && info.score.allied == 5 && info.raw_time_remaining == "0:00:00") {
            alliedScore = alliedScore;
            axisScore = axisScore;
        } else {
            alliedScore = info.score.allied;
            axisScore = info.score.axis;
        }

        const embed = new EmbedBuilder()
            .setTitle(info.name)
            .setDescription(
                `Current Map: **${humanMapName}**\n` +
                    `Game Mode: **${gameMode}** ${
                        gameMode.toLowerCase() == "offensive"
                            ? attackerEmoji + " vs " + defenderEmoji
                            : ""
                    }\n` +
                    `Player Count: **${info.player_count}/${info.max_player_count}** ${playerCountEmoji}\n\n` +
                    `Allied Players: **${info.players.allied}**\n` +
                    `Axis Players: **${info.players.axis}**\n\n` +
                    (mapNotStarted
                        ? "The match has not started yet. Waiting for seeders.\n"
                        : "") +
                    (showVotes && info.raw_time_remaining !== "0:00:00"
                        ? `Total Votes: ${
                              info.vote_status.total_votes
                          }\nWinning Maps: ${info.vote_status.winning_maps
                              .map((map) => map[0])
                              .join(", ")}\n`
                        : "")
            )
            .setColor(axisScore > alliedScore ? 0xff0000 : 0x0000ff)
            .setImage(imageUrl)
            .setTimestamp()
            .addFields(
                { name: "Axis", value: `${alliedScore}`, inline: true },
                {
                    name: "Battle Status",
                    value: `${battleStatus}`,
                    inline: true,
                },
                { name: "Axis", value: `${axisScore}`, inline: true }
            )
            .addFields(performerFields);

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
    setInterval(updateStatusMessage, config.updateInterval*1000);
};

module.exports = setupServerStatus;
