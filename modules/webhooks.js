const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 5020;

app.use(bodyParser.json());

module.exports = (client, pool, config, ChannelType) => {
    const modulesConfig = JSON.parse(fs.readFileSync("./config/modules.json", "utf8"));

    // Loop through the modules and create endpoints for those with webhook enabled
    modulesConfig.modules.forEach((moduleConfig) => {
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

            // Initialize the table for the module if it has a `db` configuration
            if (moduleSettings.db) {
                if (Array.isArray(moduleSettings.db)) {
                    moduleSettings.db.forEach(async (tableName) => {
                        await initializeTable(pool, tableName);
                    });
                } else {
                    initializeTable(pool, moduleSettings.db);
                }
            }

            // Load the module if it exists
            if (fs.existsSync(modulePath)) {
                webhookModule = require(modulePath)(client, pool, moduleSettings, ChannelType);
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
    });

    // Start the server
    app.listen(port, () => {
        console.log("Webhooks", `🤖 Webhook server running on port ${port}`);
    });
};

// Function to initialize a PostgreSQL table if it doesn't exist
const initializeTable = async (pool, tableName) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
            id SERIAL PRIMARY KEY,
            key TEXT UNIQUE,
            value JSONB
        );
    `;
    try {
        await pool.query(createTableQuery);
        console.log(`Webhooks: Initialized table "${tableName}"`);
    } catch (err) {
        console.error(`Webhooks: Failed to initialize table "${tableName}":`, err);
    }
};
