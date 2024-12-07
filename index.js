// Loggers
const logger = require('./logger');

// Override console methods
// Override console.log
global.console.log = (moduleName = '', ...args) => {
    const prefix = moduleName ? `${moduleName}: ` : '';
    const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    logger.info(`${prefix}${message}`);
};

// Override console.error
global.console.error = (moduleName = '', ...args) => {
    const prefix = moduleName ? `${moduleName}: ` : '';
    const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    logger.error(`${prefix}${message}`);
};

// Override console.warn
global.console.warn = (moduleName = '', ...args) => {
    const prefix = moduleName ? `${moduleName}: ` : '';
    const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    logger.warn(`${prefix}${message}`);
};

console.log("========Application Startup=======");

require("dotenv").config();

const { Pool } = require("pg");

const POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
const POSTGRES_PORT = process.env.POSTGRES_PORT || 5433;
const POSTGRES_USER = process.env.POSTGRES_USER || '1sta';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD;
const POSTGRES_DB = process.env.POSTGRES_DB || 'crcon_discord_db';

// Set up PostgreSQL connection pool
const pool = new Pool({
    host: POSTGRES_HOST,
    port: POSTGRES_PORT,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DB,
});

// Validate database connection
pool.connect()
    .then(() => console.log("🤖", "PostgreSQL connected successfully"))
    .catch((err) => {
        console.error("🤖", "Failed to connect to PostgreSQL:", err);
        process.exit(1);
    });

const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
} = require("discord.js");

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

const fs = require("fs");
const path = require("path");

// Load configuration
const configPath = path.join(__dirname, "config", "modules.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const initializeTable = require('./modules/tableInitializer.js');

// Dynamically load and set up modules with their respective PostgreSQL tables
config.modules.forEach(async (moduleConfig) => {
    const moduleName = Object.keys(moduleConfig)[0];

    if (moduleName === "webhooks") {
        console.log("🤖", "Loading Webhooks module...");
        require("./modules/webhooks")(client, pool, config, ChannelType);
        return; // Skip this iteration
    }

    if (moduleConfig.webhook) return; // Skip webhook modules

    const moduleSettings = moduleConfig[moduleName];

    // Initialize any associated DB tables for this module
    await initializeTable(pool, moduleName);

    const modulePath = path.join(__dirname, "modules", `${moduleName}.js`);

    if (fs.existsSync(modulePath)) {
        const setupModule = require(modulePath);
        setupModule(client, pool, moduleSettings, ChannelType); // Pass necessary arguments
        console.log("🤖", `Loaded module: ${moduleName}`);
    } else {
        console.error("🤖", `Module not found: ${moduleName}`);
    }
});

client.once("ready", () => {
    console.log("🤖", `Logged in as ${client.user.tag}!`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
