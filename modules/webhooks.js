const express = require("express");
const bodyParser = require("body-parser");
const Datastore = require("nedb-promises");

module.exports = (client, db, config, ChannelType) => {
    const app = express();
    const port = config.port || 5020;

    app.use(bodyParser.json());

    // Loop through the modules and create endpoints for those with webhook enabled
    config.modules.forEach((moduleConfig) => {
        const moduleName = Object.keys(moduleConfig)[0]; // Get the module name
        const moduleSettings = moduleConfig[moduleName]; // Get the module's configuration

        if (moduleSettings.webhook) {
            let webhookId = Math.floor(Math.random() * 1000000);  // Random ID
            let webhookToken = Math.random().toString(36).substring(2); // Random token

            // Handle GET requests for webhook validation
            app.get(`/webhook/${moduleName}`, (req, res) => {
                res.json({ id: webhookId.toString(), token: webhookToken });
            });

            // Initialize the database for this module (move from index.js)
            if (moduleSettings.db && !db[moduleSettings.db]) {
                db[moduleSettings.db] = Datastore.create({
                    filename: `db/${moduleSettings.db}.db`,
                    autoload: true,
                });
            }

            // Get the appropriate db instance for this module
            const moduleDb = db[moduleSettings.db];

            // Initialize the module with the correct parameters
            const module = require(`./${moduleName}`)(client, moduleDb, moduleSettings, ChannelType);

            // Handle POST requests for webhook usage
            app.post(`/webhook/${moduleName}`, (req, res) => {
                if (module && module.processWebhookData) {
                    module.processWebhookData(req.body, moduleSettings, moduleDb);
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
