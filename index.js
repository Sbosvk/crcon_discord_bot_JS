// Loggers
orgLog = console.log;
errLog = console.error;

console.log = (moduleName = '', ...args) => {
    const timestamp = new Date().toISOString();
    const prefix = moduleName ? `🧩 ${moduleName}: ` : '';
    orgLog(`[${timestamp}] ${prefix}`, ...args);
}

console.error = (moduleName = '', ...args) => {
    const timestamp = new Date().toISOString();
    const prefix = moduleName ? `🧩 ${moduleName}: ` : '';
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

    if (moduleName === "webhooks") {
        console.log("index", "Loading Webhooks module..");
        require("./modules/webhooks");
        return; // Skip this iteration
    }

    const moduleSettings = moduleConfig[moduleName];
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
