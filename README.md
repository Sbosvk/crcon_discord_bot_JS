# CRCON Discord Bot JS

CRCON Discord Bot JS is a versatile Discord bot designed to enhance gaming communities by integrating Discord functionality with in-game server management. This bot is fully compatible with **CRCON v.10 API**, ensuring seamless interaction with the latest server management tools.

The module allows for dynamic voice channel creation, admin message relay from Discord to in-game, live server status updates, and more—all configurable via a modular architecture.

This is a fully working application, though still a work in progress.
## Installation

To set up the bot, you need Node.js (tested on NodeJS 20) and npm installed:

```bash
npm install
```

## Configuration

Before running the bot, configure the modules.json for specific module settings and create a .env file for environment variables:

```
CRCON_API_URL=<api_url_here>
CRCON_API_TOKEN=<api_token_here>
DISCORD_BOT_TOKEN=<discord_bot_token_here>
```

You can refer to `./config/modules.sample.json` for an example configuration of the modules.

## Module Configuration and Instantiation

The CRCON Discord Bot JS is designed with a modular architecture to facilitate easy customization and scalability. Modules are configured through a JSON file and dynamically loaded at runtime.

### Configuring Modules

Modules are configured in a `modules.json` file located in the `config` directory. This JSON file contains an array of objects, each representing a module with its specific settings. Instead of detailing an example here, please refer to `./config/modules.sample.json` for a sample configuration file.

#### Module Parameters

Here are some common modules and their configuration parameters:

- **register_commands**: Configures the module that handles the registration of Discord commands.
  - **applicationID**: The Discord application ID.
  - **guildID**: The ID of the Discord guild (server) where the commands are registered.

- **create_channel**: Manages the creation and administration of voice channels.
  - **id**: A specific identifier used within the module (e.g., a channel ID where operations begin).
  - **db**: The name of the database file associated with this module.
  - **parentID**: The ID of the parent category under which new channels are created.

- **server_status**: Updates a designated channel with server status information.
  - **channelID**: The ID of the Discord channel where status updates are posted.
  - **updateInterval**: How frequently (in seconds) the status updates are posted.

- **admin_alert_responses**: Handles in-game messaging in response to Discord interactions.
  - **channelID**: The channel ID for receiving admin alerts.

- **teamkill_alerter:** Monitors and alerts when a player teamkills a certain number of friendlies within a specified time frame.
  - **channelID**: The ID of the Discord channel where teamkill alerts are posted.
  - **webhookChannelID**: The ID of the Discord channel for webhook messages.
  - **db**: The name of the database file associated with this module.
  - **updateInterval**: How frequently (in seconds) the status updates are checked.
  - **alertAt**: The number of teamkills required to trigger an alert.
  - **timeframe**: The time frame (in minutes) to monitor for teamkills.
  - **profile_url_prefix**: The URL prefix for player profiles.


#### Dynamic Module Loading

Modules are dynamically loaded at runtime based on the configuration. Here’s how the loading process works in the application’s `index.js`:

```js
const db = {}; // Database instances

// Read and parse the configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config", "modules.json"), "utf8"));

// Dynamically load and configure each module
config.modules.forEach((moduleConfig) => {
    const moduleName = Object.keys(moduleConfig)[0];
    const moduleSettings = moduleConfig[moduleName];
    const modulePath = path.join(__dirname, "modules", `${moduleName}.js`);

    if (fs.existsSync(modulePath)) {
        const setupModule = require(modulePath);
        setupModule(client, db[moduleSettings.db], moduleSettings);
        console.log(`Loaded module: ${moduleName}`);
    } else {
        console.error(`Module not found: ${moduleName}`);
    }
});
```

##### Native Webhooks Integration

The bot now supports native webhooks, allowing it to interact directly with CRCON's webhook system. If a module is configured with the `"webhook": true` parameter, it will rely on native webhooks rather than Discord channels for its functionality. This setup is particularly useful for high-traffic modules like kill logs or teamkill alerts where Discord channel spam needs to be avoided.

## Usage

This application includes several key functionalities:

- **Voice Channel Management**: Automatically creates voice channels when users join a specific trigger channel. The creator receives admin rights to manage the channel with commands such as `/vcmute`, `/vcunmute`, `/vckick`, and `/vcban`.
- **Admin Alert Messaging**: If configured, the bot allows Discord admins to send messages directly to the game server in response to player reports, and online in-game admins are pinged automatically.
- **Server Status Updates**: Automatically updates a Discord channel with live server status, configurable update intervals through module settings.
- **Native Webhooks**: For modules like teamkill alerts or kill logs, the bot can now process data directly from CRCON's webhook system without relying on Discord channels, reducing noise and improving efficiency.

## Contributing

Contributions are welcome! To contribute, please clone the repository, create a new branch for your features or fixes, and submit a pull request to the master branch:

```bash
git clone https://github.com/Sbosvk/crcon_discord_bot_JS.git
git checkout -b your-feature-branch
# Make changes
git commit -am "Add some feature"
git push origin your-feature-branch
```

## License

This project is licensed under the MIT License - see the LICENSE.md file for details.

## Credits

- [Hell Let Loose Community RCON (CRCON)](https://github.com/MarechJ/hll_rcon_tool) - For providing the API interfaced by this bot.
- **Node.js** and **Discord.js** for the underlying technology.