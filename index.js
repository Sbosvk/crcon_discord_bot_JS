// Loggers
orgLog = console.log;
errLog = console.error;

console.log = (moduleName = '', ...args) => {
    const timestamp = new Date().toISOString();
    const prefix = moduleName ? ` ${moduleName}: ` : '';
    orgLog(`[${timestamp}] ${prefix}`, ...args);
}

console.error = (moduleName = '', ...args) => {
    const timestamp = new Date().toISOString();
    const prefix = moduleName ? ` ${moduleName}: ` : '';
    errLog(`[${timestamp}] ${prefix}`, ...args);
}
require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
} = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ],
    partials: [Partials.Channel],
});

const db = {}; // Initialize an empty object to hold database instances

const fs = require("fs");
const path = require("path");

// Load configuration
const configPath = path.join(__dirname, "config", "modules.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Initialize Datastore
const Datastore = require("nedb-promises");

// Dynamically load and set up modules with their respective databases
config.modules.forEach((moduleConfig) => {
    const moduleName = Object.keys(moduleConfig)[0];
    const moduleSettings = moduleConfig[moduleName];

    // Skip loading webhook-enabled modules in index.js
    if (moduleSettings.webhook) {
        console.log("index", `Skipping loading of webhook-enabled module: ${moduleName}`);
        return; // Skip this module, as webhooks.js will handle it
    }

    if (moduleName === "webhooks") {
        console.log("index", "Loading Webhooks module..");
        const webhooksModule = require(`./modules/${moduleName}`);
        webhooksModule(client, db, config, ChannelType); // Pass necessary parameters
        return; // Skip this iteration
    }

    const modulePath = path.join(__dirname, "modules", `${moduleName}.js`);

    // Set up the database for each module
    if (moduleSettings.db) {
        db[moduleSettings.db] = Datastore.create({
            filename: `db/${moduleSettings.db}.db`,
            autoload: true,
        });
    }

    if (fs.existsSync(modulePath)) {
        const setupModule = require(modulePath);
        setupModule(client, db[moduleSettings.db], moduleSettings, ChannelType); // Pass Discord client, specific database, entire module setting, and ChannelType Dicord class
        console.log(`Loaded module: ${moduleName}`);
    } else {
        console.error(`Module not found: ${moduleName}`);
    }
});

client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
});

client.login(DISCORD_TOKEN);
