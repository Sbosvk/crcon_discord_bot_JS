// Loggers
orgLog = console.log;
errLog = console.error;

console.log = (moduleName = '', ...args) => {
    const timestamp = new Date().toISOString();
    const prefix = moduleName ? ` ${moduleName}: ` : '';
    orgLog(`[${timestamp}] ${prefix}`, ...args);
};

console.error = (moduleName = '', ...args) => {
    const timestamp = new Date().toISOString();
    const prefix = moduleName ? ` ${moduleName}: ` : '';
    errLog(`[${timestamp}] ${prefix}`, ...args);
};
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

const initializedDbs = {}; // Shared object to track initialized databases
const fs = require("fs");
const path = require("path");

// Load configuration
const configPath = path.join(__dirname, "config", "modules.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Initialize Datastore
const Datastore = require("nedb-promises");

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

// Dynamically load and set up modules with their respective databases
config.modules.forEach((moduleConfig) => {
    const moduleName = Object.keys(moduleConfig)[0];

    if (moduleName === "webhooks") {
        console.log("index", "Loading Webhooks module..");
        require("./modules/webhooks")(client, initializedDbs, config, ChannelType);
        return; // Skip this iteration
    }

    const moduleSettings = moduleConfig[moduleName];
    const modulePath = path.join(__dirname, "modules", `${moduleName}.js`);

    // Set up the database for each module
    if (moduleSettings.db) {
        const dbInstance = Array.isArray(moduleSettings.db)
            ? moduleSettings.db.map(dbName => initializeDb(dbName)) // Handle array of db names
            : initializeDb(moduleSettings.db); // Single db name
        db[moduleSettings.db] = dbInstance;
    }

    if (fs.existsSync(modulePath)) {
        const setupModule = require(modulePath);
        setupModule(client, db[moduleSettings.db], moduleSettings, ChannelType); // Pass necessary arguments
        console.log(`Loaded module: ${moduleName}`);
    } else {
        console.error(`Module not found: ${moduleName}`);
    }
});

client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
});

client.login(DISCORD_TOKEN);