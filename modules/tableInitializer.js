// Module table creation queries
const tableQueries = {
    "anticheat": `
        CREATE TABLE IF NOT EXISTS anticheat (
            steamID TEXT PRIMARY KEY,
            playerName TEXT,
            killCount INTEGER DEFAULT 0,
            killStreak INTEGER DEFAULT 0,
            timestamps JSONB DEFAULT '[]',
            weaponUsage JSONB DEFAULT '{}'
        );
    `,
    "create_channel": `
        CREATE TABLE IF NOT EXISTS channels (
            channelId TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            adminId TEXT NOT NULL,
            bannedUsers TEXT[],
            mutedUsers TEXT[]
        );
    `,
    "custom_commands": `
        CREATE TABLE IF NOT EXISTS channels (
            channelId TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            adminId TEXT NOT NULL,
            bannedUsers TEXT[],
            mutedUsers TEXT[]
        );
    `,
    "death_stats_tracker": `
        CREATE TABLE IF NOT EXISTS player_preferences (
            steamID TEXT PRIMARY KEY,
            optedOut BOOLEAN DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS death_stats (
            steamID TEXT PRIMARY KEY,
            playerName TEXT,
            kills INTEGER DEFAULT 0,
            kills_streak INTEGER DEFAULT 0,
            teamkills INTEGER DEFAULT 0,
            longest_life_secs INTEGER DEFAULT 0,
            shortest_life_secs INTEGER DEFAULT NULL,
            combat INTEGER DEFAULT 0,
            offense INTEGER DEFAULT 0,
            defense INTEGER DEFAULT 0,
            support INTEGER DEFAULT 0,
            kills_per_minute NUMERIC DEFAULT 0,
            kill_death_ratio NUMERIC DEFAULT 0
        );
    `,
    "seed_vip": `
        CREATE TABLE IF NOT EXISTS seed_vip (
            key TEXT PRIMARY KEY,
            value JSONB
        );
    `,
    "seeding_status": `
        CREATE TABLE IF NOT EXISTS seeding_status (
            key TEXT PRIMARY KEY,
            value JSONB
        );
    `,
    "teamkill_alerter": `
        CREATE TABLE IF NOT EXISTS teamkill_alerter (
            steamID TEXT PRIMARY KEY,
            playerName TEXT,
            totalTKs INTEGER DEFAULT 0,
            timestamps JSONB DEFAULT '[]'
        );
    `,
    "track_player_stats": `
        CREATE TABLE IF NOT EXISTS live_game_scores (
            steamID TEXT PRIMARY KEY,
            playerName TEXT,
            role TEXT,
            squad TEXT,
            team TEXT,
            combatPoints INTEGER DEFAULT 0,
            supportPoints INTEGER DEFAULT 0,
            offensivePoints INTEGER DEFAULT 0,
            defensivePoints INTEGER DEFAULT 0,
            nodesBuilt INTEGER DEFAULT 0,
            nodesDestroyed INTEGER DEFAULT 0,
            garrisonsBuilt INTEGER DEFAULT 0,
            garrisonsDestroyed INTEGER DEFAULT 0,
            vehiclesDestroyed INTEGER DEFAULT 0,
            tanksDestroyed INTEGER DEFAULT 0,
            lastUpdate TIMESTAMP DEFAULT NOW()
        );
    `,
    "votemap_reset": `
        CREATE TABLE IF NOT EXISTS votemap_reset (
            key TEXT PRIMARY KEY,
            timestamp BIGINT,
            playerCount INTEGER
        );
    `,
    "watchlist_monitor": `
        CREATE TABLE IF NOT EXISTS watchlist_monitor (
            player_id TEXT PRIMARY KEY,
            player_name TEXT,
            last_notified TIMESTAMP DEFAULT NULL
        );
    `
};

/**
 * Initialize tables for a specific module if available.
 * Handles multiple CREATE TABLE statements by splitting on `;`.
 * 
 * @param {Pool} pool - The PostgreSQL pool instance.
 * @param {string} moduleName - The module name.
 */
const initializeTable = async (pool, moduleName) => {
    if (!pool || !moduleName) return;

    const name = moduleName.toLowerCase();
    if (!tableQueries[name]) return; // No table query for this module

    try {
        console.log("🧩", `Initializing tables for module: ${moduleName}`);
        
        // Split multiple queries if present
        const statements = tableQueries[name]
            .split(";")
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        for (const stmt of statements) {
            await pool.query(stmt);
        }

        console.log("🧩", `Tables for "${moduleName}" initialized.`);
    } catch (err) {
        console.error("🧩", `Error initializing tables for ${moduleName}`, err);
    }
};

module.exports = initializeTable;