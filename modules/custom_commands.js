const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

const handleChatWebhook = (data, config) => {
    console.log("Chat Webhook Data Received: ", JSON.stringify(data, null, 2));

    // You can expand this part later to handle different commands
    // For now, we're just logging the webhook data to understand its structure
};

module.exports = (client, db, config) => {
    if (config.webhook) {
        console.log("Custom Command Module", "Using native webhook mode.");

        return {
            processWebhookData: (data) => handleChatWebhook(data, config),
        };
    } else {
        console.log("Custom Command Module", "No webhook detected for custom command module.");
    }
};
