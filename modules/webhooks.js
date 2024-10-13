const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
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

// Loop through the modules and create endpoints for those with webhook enabled
modulesConfig.modules.forEach((moduleConfig) => {
    const moduleName = Object.keys(moduleConfig)[0]; // Get the module name
    const config = moduleConfig[moduleName]; // Get the module's configuration

    if (config.webhook) {
        let webhookId = Math.floor(Math.random() * 1000000); // Random ID
        let webhookToken = Math.random().toString(36).substring(2); // Random token

        // Handle GET requests for webhook validation
        app.get(`/webhook/${moduleName}`, (req, res) => {
            res.json({ id: webhookId.toString(), token: webhookToken });
        });

        // Initialize the database(s) for this module
        const dbInstance = Array.isArray(config.db)
            ? config.db.map(dbName => initializeDb(dbName)) // Handle array of db names
            : initializeDb(config.db); // Single db name

        const module = require(`./${moduleName}`)(null, dbInstance, config);

        // Handle POST requests for webhook usage
        app.post(`/webhook/${moduleName}`, (req, res) => {
            if (module && module.processWebhookData) {
                module.processWebhookData(req.body, config, dbInstance);
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