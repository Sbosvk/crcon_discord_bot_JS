const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 5020;

app.use(bodyParser.json());

let generateWebhookIdentifiers = () => {
        return {
            id: Math.floor(Math.random() * 1000000).toString(),
            token: Math.random().toString(36).substring(2)
        }
};

module.exports = async (client, pool, config, ChannelType) => {
    const modulesConfig = JSON.parse(fs.readFileSync("./config/modules.json", "utf8"));

    // Loop through the modules and create endpoints for those with webhook enabled
    for (const moduleConfig of modulesConfig.modules) {
        const moduleName = Object.keys(moduleConfig)[0];
        const moduleSettings = moduleConfig[moduleName];

        if (moduleSettings.webhook) {
            

            // Handle GET requests for webhook validation
            app.get(`/webhook/${moduleName}`, (req, res) => {
                res.json(generateWebhookIdentifiers());
            });

            const modulePath = path.join(__dirname, `${moduleName}.js`);
            let webhookModule;

            if (fs.existsSync(modulePath)) {
                try {
                    webhookModule = await require(modulePath)(client, pool, moduleSettings, ChannelType);
                } catch (error) {
                    console.error("🧩", `Error loading webhook module: ${moduleName}`, error);
                }
            } else {
                console.warn("🧩", `Webhook module not found: ${moduleName}`);
            }

            // Handle POST requests for webhook usage
            app.post(`/webhook/${moduleName}`, async (req, res) => {
                try {
                    if (webhookModule && webhookModule.processWebhookData) {
                        let webhook = generateWebhookIdentifiers();
                        const response = await webhookModule.processWebhookData(req.body, moduleSettings, pool);
                        
                        // Ensure the response is a JSON object
                        if (response && typeof response === "object") {
                            res.status(200).json(response);
                        } else {
                            // Default to a success response if no object is returned
                            res.status(200).json({ id: webhook.id, token: webhook.token, status: "success", message: "Webhook processed successfully" });
                        }
                    } else {
                        console.error("🧩", `No processWebhookData function defined for ${moduleName}`);
                        res.status(500).json({ id: webhook.id, token: webhook.token, status: "error", message: `No processWebhookData function defined for ${moduleName}` });
                    }
                } catch (error) {
                    console.error("🧩", `Error processing webhook for ${moduleName}:`, error);
                    res.status(500).json({ id: webhook.id, token: webhook.token, status: "error", message: "Bot error", details: error.message });
                }
            });
            
        }
    }

    // Start the server
    app.listen(port, () => {
        console.log("🧩🤖", `Webhook server running on port ${port}`);
    });
};
