const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 5020;

app.use(bodyParser.json());

const Datastore = require("nedb-promises");
const initializedDbs = {}; // Shared object to track initialized databases

// Function to initialize a database and store it in the initializedDbs object
function initializeDb(dbName) {
    if (!initializedDbs[dbName]) {
        initializedDbs[dbName] = Datastore.create({
            filename: `db/${dbName}.db`,
            autoload: true,
        });
    }
    return initializedDbs[dbName];
}

// Load the modules configuration
const modulesConfig = JSON.parse(fs.readFileSync("./config/modules.json", "utf8"));

module.exports = (client, initializedDbs, config, ChannelType) => {
    // Loop through the modules and create endpoints for those with webhook enabled
    modulesConfig.modules.forEach((moduleConfig) => {
        const moduleName = Object.keys(moduleConfig)[0]; // Get the module name
        const moduleSettings = moduleConfig[moduleName]; // Get the module's configuration

        if (moduleSettings.webhook) {
            let webhookId = Math.floor(Math.random() * 1000000); // Random ID
            let webhookToken = Math.random().toString(36).substring(2); // Random token

            // Handle GET requests for webhook validation
            app.get(`/webhook/${moduleName}`, (req, res) => {
                res.json({ id: webhookId.toString(), token: webhookToken });
            });

            let dbInstance = null;
            if (moduleSettings.db) {
                // Initialize the database(s) for this module
                const dbInstance = Array.isArray(moduleSettings.db)
                ? moduleSettings.db.map(dbName => initializeDb(dbName)) // Handle array of db names
                : initializeDb(moduleSettings.db); // Single db name
            }

            const modulePath = path.join(__dirname, `${moduleName}.js`);
            let webhookModule;
            
            if (fs.existsSync(modulePath)) {
                // Load the module and pass necessary dependencies
                webhookModule = require(modulePath);
                webhookModule(client, dbInstance, moduleSettings, ChannelType);  // Pass client, db, config, ChannelType
            } else {
                console.error('webhooks', `Module not found: ${moduleName}`);
            }

            // Handle POST requests for webhook usage
            app.post(`/webhook/${moduleName}`, (req, res) => {
                if (webhookModule && webhookModule.processWebhookData) {
                    webhookModule.processWebhookData(req.body, moduleSettings, dbInstance);
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
