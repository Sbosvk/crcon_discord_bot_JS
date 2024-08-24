const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();
const port = 5020;

app.use(bodyParser.json());

// Load the modules configuration
const modulesConfig = JSON.parse(fs.readFileSync('./config/modules.json', 'utf8'));

// Loop through the modules and create endpoints for those with webhook enabled
Object.keys(modulesConfig).forEach(moduleName => {
    const config = modulesConfig[moduleName];
    if (config.webhook) {
        app.post(`/webhook/${moduleName}`, (req, res) => {
            console.log("Webhooks", `Received webhook data for ${moduleName}:`, req.body);

            // Pass the data to the appropriate module logic
            const module = require(`./modules/${moduleName}`);
            module.processWebhookData(req.body, config);

            res.sendStatus(200);
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log("Webhooks", `🤖 Webhook server running on port ${port}`);
});
