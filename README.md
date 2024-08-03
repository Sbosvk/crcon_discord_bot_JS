# CRCON Discord Bot JS

CRCON Discord Bot JS is a versatile Discord bot designed to enhance gaming communities by integrating Discord functionality with in-game server management. This bot allows for dynamic voice channel creation, admin message relay from Discord to in-game, and live server status updates, all configurable via a modular architecture.

This is a fully working application, although it is still a work in progress.

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

## Module Configuration and Instantiation

The CRCON Discord Bot JS is designed with a modular architecture to facilitate easy customization and scalability. Modules are configured through a JSON file and dynamically loaded at runtime. Here’s how it works:

### Configuring Modules

Modules are configured in a modules.json file located in the config directory. This JSON file contains an array of objects, each representing a module with its specific settings. Here is an example of what the modules.json file looks like:

```json
{
    "modules": [
        {
            "register_commands": {
                "applicationID": "123123123123",
                "guildID": "123123123123"
            }
        },
        {
            "create_channel": {
                "id": "123123123123",
                "db": "channels",
                "parentID": "123123123123"
            }
        },
        {
            "server_status": {
                "channelID": "123123123123",
                "updateInterval": "5"
            }
        },
        {
            "admin_alert_responses": {
                "channelID": "123123123123"
            }
        }
    ]
}

```

Each module object contains a key representing the module's name and a value that is another object specifying configuration parameters for that module.

#### Module Parameters

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

#### Dynamic Module Loading

Modules are dynamically loaded at runtime based on the configuration. Here’s how the loading process works in the application’s index.js:

1. **Load Configuration**: The application reads the modules.json configuration file.
2. **Initialize Database Instances**: If a module requires database support, it initializes a NeDB database instance specifically for that module.
3. **Load Modules**: Each module's JavaScript file is required, and the module is instantiated with the Discord client, its specific database instance (if any), and its configuration settings.
javascript

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

#### Summary

This modular configuration allows the bot to be easily extended with new functionalities by simply adding new module configurations and corresponding JavaScript files. It encourages separation of concerns and makes the bot highly maintainable and scalable.

## Usage

This application includes several key functionalities:

- **Voice Channel Management**: Automatically creates voice channels when users join a specific trigger channel. The creator receives admin rights to manage the channel with commands such as `/vcmute`, `/vckick`, and `/vcban`.
- **Admin Alert Messaging**: If configured, the bot allows Discord admins to send messages directly to the game server in response to player reports.
- **Server Status Updates**: Automatically updates a Discord channel with live server status, configurable update intervals through module settings.

## Contributing

Contributions are welcome! To contribute, please clone the repository, create a new branch for your features or fixes, and submit a pull request to the master branch:

```bash
git clone <repository-url>
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