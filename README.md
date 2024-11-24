# CRCON Discord Bot JS

CRCON Discord Bot JS is a versatile Discord bot designed to enhance gaming communities by integrating Discord functionality with in-game server management. This bot is fully compatible with **CRCON v.10 API**, ensuring seamless interaction with the latest server management tools.

The module allows for dynamic voice channel creation, admin message relay from Discord to in-game, live server status updates, and more—all configurable via a modular architecture.

This is a fully working application, though still a work in progress.
## Installation

1. **Clone the repository:**
   
    ```bash
    git clone https://github.com/Sbosvk/crcon_discord_bot_JS.git
    cd crcon_discord_bot_JS
    ```

2. **Install dependencies:**

    To set up the bot, you need Node.js (tested on NodeJS 20) and npm installed.

    ```
    npm install
    ```

3. **Configure PostgreSQL:**

     - Copy the provided `compose-template.yml` to `compose.yml`:

       ```bash
       cp compose-template.yml compose.yml
       ```

     - Edit `compose.yml` to set your PostgreSQL credentials:

       ```yaml
       environment:
         POSTGRES_USER: <your_username>
         POSTGRES_PASSWORD: <your_password>
         POSTGRES_DB: crcon_discord_db
       ```

4. **Spin up the PostgreSQL**

    ```bash
    docker compose up -d
    ```

5. **Set up the environment variables: Create a `.env` file in the root directory with the following:**

    ```makefile
    CRCON_API_URL=<api_url_here>
    CRCON_API_TOKEN=<api_token_here>
    DISCORD_BOT_TOKEN=<discord_bot_token_here>
    POSTGRES_HOST=localhost
    POSTGRES_PORT=5433
    POSTGRES_USER=<your_username>
    POSTGRES_PASSWORD=<your_password>
    POSTGRES_DB=crcon_discord_db
    ```

6. **Configure modules:**
    
    Update `./config/modules.json` to enable or configure specific modules.
    
    Refer to `./config/modules.sample.json` for an example configuration file.

## Features and Modules

The CRCON Discord Bot JS is designed with a modular architecture to facilitate easy customization and scalability. Modules are configured through a JSON file and dynamically loaded at runtime.

Modules are configured in a `modules.json` file located in the `config` directory. This JSON file contains an array of objects, each representing a module with its specific settings. Instead of detailing an example here, please refer to `./config/modules.sample.json` for a sample configuration file. Below is a list of supported modules with their respective configurations:

---

### Create Channel (`create_channel`)

Manages dynamic voice channel creation and administration.
Automatically creates voice channels when users join a specific trigger channel. The creator receives admin rights to manage the channel with commands such as `/vcmute`, `/vcunmute`, `/vckick`, and `/vcban`.

- **Parameters:**
  - `id`: Channel ID to trigger dynamic channel creation.
  - `parentID`: Parent category ID for new channels.

---

### Server Status (`server_status`)
Updates a specified channel with real-time server status information.

- **Parameters:**
  - `channelID`: Discord channel ID for status updates.
  - `updateInterval`: Update interval in seconds.
  - `minPlayerChange`: Minimum player count change to trigger an update.

---

### Admin Ping Monitor (`admin_ping_monitor`)
Listens for admin pings in a monitored Discord channel or webhook and notifies in-game online admins with the report.

- **Parameters:**
  - `webhook`: Boolean to enable native webhook integration.
  - `channelID`: Discord channel ID for monitoring admin pings.
  - `adminMappings`: An array mapping admin Steam IDs to Discord IDs. This is used to identify and notify in-game admins who are also on Discord.

---

### Admin Alert Responses (`admin_alert_responses`)
Allows in-game admin alerts relayed to Discord to be responded to.

- **Parameters:**
  - `channelID`: Discord channel ID for admin alerts.

- **Dependencies:**
  - Requires `embed.author.url` to be steam profile url of reporter.

---

### Seeding Status (`seeding_status`)
Tracks and announces seeding milestones for the server.

- **Parameters:**
  - `channelID`: Discord channel ID for seeding announcements.
  - `updateInterval`: Update interval in seconds.
  - `triggerSteps`: Number of steps to divide the seeding milestones.
  - `debounceMinutes`: Minimum delay between announcements (in minutes).

---

### Seed VIP (`seed_vip`)
Rewards active seeding players with VIP status.

- **Parameters:**
  - `channelID`: Discord channel ID for VIP announcements.
  - `requiredActivityMinutes`: Minimum activity time in minutes to qualify for VIP.
  - `vipDurationHours`: Duration(s) of VIP status in hours (single value or array).
  - `checkIntervalSeconds`: Check interval in seconds.
  - `cooldownPeriodHours`: Cooldown period in hours between VIP grants.
  - `vipGrantCount`: Number of players to grant VIP status per check.

---

### Custom Commands (`custom_commands`)
Enables custom chat-based commands for players.

- **Parameters:**
  - `webhook`: Boolean to enable native webhook integration.

---

### Death Stats Tracker (`death_stats_tracker`)
Sends performance summaries to players based on their in-game deaths.

- **Parameters:**
  - `webhook`: Boolean to enable native webhook integration.
    - Only native webhooks are currently available for this module.
  - `pollDelay`: Number of seconds to wait before polling and presenting stats.
    - Value should be >= to `live_stats_refresh_seconds` in CRCON Settings.

---

### Teamkill Alerter (`teamkill_alerter`)
Monitors and alerts admins about excessive teamkilling activity.

- **Parameters:**
  - `webhook`: Boolean to enable native webhook integration.
  - `channelID`: Discord channel ID for alerts.
  - `updateInterval`: Update interval in seconds.
  - `alertAt`: Number of teamkills to trigger an alert.
  - `timeframe`: Monitoring timeframe in minutes.

---

### Anticheat (`anticheat`)
Monitors suspicious activity and sends alerts.

- **Parameters:**
  - `channelID`: Discord channel ID for anticheat alerts.
  - `webhook`: Boolean to enable native webhook integration.
  - `alertThreshold`: Threshold for suspicious activity alerts.
  - `timeframe`: Monitoring timeframe in minutes.

---

### Watchlist Monitor (`watchlist_monitor`)
Notifies admins when watchlisted players are online.

- **Parameters:**
  - `webhook`: Boolean to enable native webhook integration.
  - `channelID`: Discord channel ID for notifications.

---

### Votemap Reset (`votemap_reset`)
Tracks and announces votemap reset events. This is used to allow for seeding maps configured in CRCON Auto settings.

- **Parameters:**
  - `channelID`: Discord channel ID for votemap reset announcements.

- **Dependencies:**
  - CRCON Seeding Auto Mod
    - `enforce_cap_fight.max_players` is used to fetch player count for seeding.

---

### Webhooks (`webhooks`)
Enables native webhook integration for the bot.

**Parameters:**
- Empty object to initialize webhook support.

---

##### Native Webhooks Integration

The bot now supports native webhooks, allowing it to interact directly with CRCON's webhook system. If a module is configured with the `"webhook": true` parameter, it will rely on native webhooks rather than Discord channels for its functionality. This setup is particularly useful for high-traffic modules like kill logs or teamkill alerts where Discord channel spam needs to be avoided.

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