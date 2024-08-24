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
Object.keys(modulesConfig).forEach((moduleName) => {
    const config = modulesConfig[moduleName];
    if (config.webhook) {
        
        // Handle GET requests for webhook validation
        app.get(`/webhook/${moduleName}`, (req, res) => {
            // Generate a random ID and token
            let webhookId = Math.floor(Math.random() * 1000000);
            let webhookToken = Math.random().toString(36).substring(2);
            // Return a JSON response with an id and token
            res.json({ id: webhookId.toString(), token: webhookToken });
        });

        // Handle POST requests for webhook usage
        app.post(`/webhook/${moduleName}`, (req, res) => {
            console.log(
                "Webhooks",`Received webhook data for ${moduleName}: ${req.body}`
            );

            // Pass the data to the appropriate module logic
            module.processWebhookData(req.body, config);

            res.sendStatus(200);
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log("Webhooks", `🤖 Webhook server running on port ${port}`);
});
