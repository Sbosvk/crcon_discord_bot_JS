const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const app = express();
const port = 5020;

app.use(bodyParser.json());

// Load the modules configuration
const modulesConfig = JSON.parse(
    fs.readFileSync("./config/modules.json", "utf8")
);

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

        const module = require(`./${moduleName}`)(null, null, config);

        // Handle POST requests for webhook usage
        app.post(`/webhook/${moduleName}`, (req, res) => {
            console.log("webhooks", `Received payload on: ${moduleName}`);
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
