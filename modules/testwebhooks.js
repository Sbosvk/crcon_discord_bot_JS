const axios = require('axios');


const testWebhookEndpoint = async (endpoint, payload) => {
    const baseUrl = "http://127.0.0.1:5020/webhook/"
    const url = `${baseUrl}${endpoint}`;


    // Ensure data is an object
    if (typeof payload !== 'object' || payload === null) {
        console.error("Provided data must be an object.");
        return;
    }

    try {
        const response = await axios.post(url, payload);
        console.log(`Successfully posted data to ${url}`);
        console.log("Response:", response.payload);
    } catch (error) {
        console.error(`Error posting data to ${url}`, error.message);
    }
}


const payloads = {};

//==========================================================================

//========================DEATH STATS TRACKER===============================

payloads.death_stats_tracker = {
    attachments: [],
    embeds: [
        {
            title: null,
            description:
                "KILL: [1stA]Witzig(Axis/76561198007632916) -> [1stA]Skank Nasty(Allies/76561198379322797) with MP40",
            url: null,
            footer: {},
            image: null,
            thumbnail: null,
            video: null,
            provider: null,
            author: null,
            fields: [],
            color: null,
            timestamp: "2024-10-11T17:54:59",
        },
    ],
    wait: true,
};

testWebhookEndpoint("death_track", payloads.death_stats_tracker);