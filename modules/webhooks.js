const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 5020;

app.use(bodyParser.json());

module.exports = async (client, pool, config, ChannelType) => {
    const modulesConfig = JSON.parse(fs.readFileSync("./config/modules.json", "utf8"));

    // Loop through the modules and create endpoints for those with webhook enabled
    for (const moduleConfig of modulesConfig.modules) {
        const moduleName = Object.keys(moduleConfig)[0];
        const moduleSettings = moduleConfig[moduleName];

        if (moduleSettings.webhook) {
            let webhookId = Math.floor(Math.random() * 1000000);
            let webhookToken = Math.random().toString(36).substring(2);

            // Handle GET requests for webhook validation
            app.get(`/webhook/${moduleName}`, (req, res) => {
                res.json({ id: webhookId.toString(), token: webhookToken });
            });

            const modulePath = path.join(__dirname, `${moduleName}.js`);
            let webhookModule;

            if (fs.existsSync(modulePath)) {
                try {
                    webhookModule = await require(modulePath)(client, pool, moduleSettings, ChannelType);
                } catch (error) {
                    console.error("webhooks", `Error loading module: ${moduleName}`, error);
                }
            } else {
                console.error("webhooks", `Module not found: ${moduleName}`);
            }

            // Handle POST requests for webhook usage
            app.post(`/webhook/${moduleName}`, (req, res) => {
                if (webhookModule && webhookModule.processWebhookData) {
                    webhookModule.processWebhookData(req.body, moduleSettings, pool);
                } else {
                    console.error(`No processWebhookData function defined for ${moduleName}`);
                }
                res.sendStatus(200);
            });
        }
    }

    // Start the server
    app.listen(port, () => {
        console.log("Webhooks", `🤖 Webhook server running on port ${port}`);
    });
};
