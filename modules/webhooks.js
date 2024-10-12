const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");

module.exports = (client, db, modulesConfig, ChannelType) => {
    const app = express();
    const port = 5020;

    app.use(bodyParser.json());

    // Loop through the modules and create endpoints for those with webhook enabled
    modulesConfig.modules.forEach((moduleConfig) => {
        const moduleName = Object.keys(moduleConfig)[0]; // Get the module name
        const config = moduleConfig[moduleName]; // Get the module's configuration
        if (config.webhook) {
            let webhookId = Math.floor(Math.random() * 1000000);  // Random ID
            let webhookToken = Math.random().toString(36).substring(2); // Random token

            // Handle GET requests for webhook validation
            app.get(`/webhook/${moduleName}`, (req, res) => {
                res.json({ id: webhookId.toString(), token: webhookToken });
            });

            // Get the appropriate db instance for this module
            const moduleDb = db[config.db];

            // Initialize the module with the correct parameters
            const module = require(`./${moduleName}`)(client, moduleDb, config, ChannelType);

            // Handle POST requests for webhook usage
            app.post(`/webhook/${moduleName}`, (req, res) => {
                if (module && module.processWebhookData) {
                    module.processWebhookData(req.body, config);
                } else {
                    console.error(`No processWebhookData function defined for ${moduleName}`);
                }
                res.sendStatus(200);
            });
        }
    });

    // Start the server
    app.listen(port, () => {
        console.log("Webhooks", `🤖 Webhook server running on port ${port}`);
    });
};
