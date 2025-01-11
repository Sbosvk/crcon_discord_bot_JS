const { logStreamManager } = require('./log_stream_manager');
const { isAdminping } = require('../utils/logStream');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const API = require("crcon.js");
require("dotenv").config();

const CRCON_API_TOKEN = process.env.CRCON_API_TOKEN;
const CRCON_API_URL = process.env.CRCON_API_URL;
const api = new API(CRCON_API_URL, { token: CRCON_API_TOKEN });

class AdminThread {
    constructor(player_id, thread_id, channel_id, client, pool, config) {
        this.player_id = player_id;
        this.thread_id = thread_id;
        this.channel_id = channel_id;
        this.client = client;
        this.pool = pool;
        this.status = 'open';
        this.config = config;
        this.inactivityTimer = null;
    }

    async start() {
        console.log(`🧩 Starting thread for player ${this.player_id}`);
        this.listenToChat();
        this.listenToDiscordMessages();
        this.resetInactivityTimer();
    }

    listenToChat() {
        logStreamManager.on("CHAT", async (log) => {
            if (log.player_id_1 === this.player_id && this.status === 'open') {
                const thread = await this.client.channels.fetch(this.thread_id);
                if (thread) {
                    await thread.send(`**[${log.player_name_1}](${this.config.player_record_base_url}${log.player_id_1})**: ${log.sub_content}`);
                }
                this.resetInactivityTimer();
            }
        });
    }

    listenToDiscordMessages() {
        this.client.on("messageCreate", async (message) => {
            // Ensure the message is from the thread
            if (message.channel.id !== this.thread_id) return;
    
            // Ignore bot messages
            if (message.author.bot) return;
    
            try {
                const adminName = message.member?.displayName || message.author.username;
    
                await api.message_player({
                    player_id: this.player_id,
                    message: message.content,
                    by: adminName,
                });
    
                console.log(`🧩 Sent message to player ${this.player_id} by ${adminName}: ${message.content}`);
            } catch (error) {
                console.error(`🧩 Error sending message to player ${this.player_id} in-game:`, error);
            }
        });
    }

    resetInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(() => {
            this.close("Thread timed out due to inactivity.");
        }, 15 * 60 * 1000); // 15 minutes
    }

    async close(reason, interaction) {
        try {
            const closedBy =
            interaction?.member?.displayName || // Server profile name
            interaction?.user?.username || 
            interaction?.user?.tag || 
            "Unknown";
    
            console.log(`🧩 Closing thread for player ${this.player_id}: ${reason}`);
            this.status = 'closed';
    
            // Acknowledge the interaction immediately
            if (interaction) {
                console.log("🧩 Acknowledging interaction before proceeding.");
                await interaction.reply({
                    content: "The thread has been closed successfully.",
                    ephemeral: true,
                });
            }
    
            // Clear timers and listeners
            if (this.inactivityTimer) {
                console.log("🧩 Clearing inactivity timer.");
                clearTimeout(this.inactivityTimer);
            }
    
            console.log("🧩 Removing chat listeners from logStreamManager.");
            try {
                logStreamManager.removeAllListeners("CHAT");
            } catch (err) {
                console.error("🧩 Error removing chat listeners:", err);
            }
    
            console.log("🧩 Removing message listeners from thread.");
            try {
                const thread = this.client.channels.cache.get(this.thread_id);
                if (thread) {
                    thread.removeAllListeners("messageCreate");
                } else {
                    console.warn(`🧩 Thread ${this.thread_id} not found in cache.`);
                }
            } catch (err) {
                console.error("🧩 Error removing message listeners:", err);
            }
    
            // Update DB
            console.log("🧩 Attempting to delete admin thread from database.");
            try {
                await this.pool.query(
                    "DELETE FROM admin_threads WHERE player_id = $1",
                    [this.player_id]
                );
                console.log("🧩 Deleted admin thread from database.");
            } catch (dbError) {
                console.error("🧩 Error deleting admin thread from database:", dbError);
                throw dbError;
            }
    
            // Inform and archive the thread
            console.log("🧩 Fetching Discord thread to archive.");
            try {
                const discordThread = await this.client.channels.fetch(this.thread_id);
                if (discordThread && discordThread.isThread()) {
                    console.log("🧩 Sending closure message to thread.");
                    await discordThread.send(`This thread has been closed by ${closedBy}. Reason: ${reason}`);
                    console.log("🧩 Locking thread on Discord.");
                    await discordThread.setLocked(true); // Lock the thread
                    console.log("🧩 Archiving thread on Discord.");
                    await discordThread.setArchived(true); // Archive the thread
                    console.log(`🧩 Locked and archived thread ${this.thread_id}`);
                } else {
                    console.warn(`🧩 Could not archive thread ${this.thread_id} (not found or not a thread).`);
                }
            } catch (discordError) {
                console.error("🧩 Error handling Discord thread archiving or locking:", discordError);
                throw discordError;
            }
    
            // Notify the player in-game
            console.log(`🧩 Notifying player ${this.player_id} in-game about thread closure.`);
            try {
                await api.message_player({
                    player_id: this.player_id,
                    message: `Your ticket has been closed by ${closedBy}. If you need further assistance, feel free to create a new report.`,
                    by: closedBy,
                });
                console.log(`🧩 Sent closure notification to player ${this.player_id} by ${closedBy}`);
            } catch (gameMessageError) {
                console.error(`🧩 Error sending in-game closure notification to player ${this.player_id}:`, gameMessageError);
                throw gameMessageError;
            }
        } catch (closeError) {
            console.error("🧩 Error in close method:", closeError);
        }
    }
    
    
}

// Declare and initialize `activeThreads`
const activeThreads = [];

// Main module
module.exports = async (client, pool, config) => {
    logStreamManager.subscribe("CHAT");

    logStreamManager.on("CHAT", async (log) => {
        const adminPing = isAdminping(log);

        if (adminPing.result) {
            const { player_id = log.player_id_1, player_name = log.player_name_1, sub_content } = log;
            const existingThread = await pool.query(
                "SELECT thread_id FROM admin_threads WHERE player_id = $1",
                [player_id]
            );

            if (existingThread.rows.length > 0) {
                console.log(`🧩 Thread already exists for player ${player_id}`);
                return;
            }

            // Fetch player avatar
            const playerProfile = await api.get_player_profile({ player_id });
            const avatarUrl = playerProfile?.steaminfo?.profile?.avatar || null;

            // Create new thread
            const channel_id = config.channel_id;
            const channel = await client.channels.fetch(channel_id);
            const thread = await channel.threads.create({
                name: `Admin Ping: ${player_name}`,
                autoArchiveDuration: 60,
            });

            const embed = new EmbedBuilder()
                .setTitle("New Admin Report")
                .setDescription(sub_content)
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: "Player", value: player_name, inline: true },
                    { name: "Steam ID", value: player_id, inline: true },
                    { name: "Profile", value: `[View Profile](${config.player_record_base_url}${player_id})`, inline: true }
                )
                .setColor(0x00ff00);

            const closeButton = new ButtonBuilder()
                .setCustomId(`close_thread_${player_id}`)
                .setLabel("Close Thread")
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(closeButton);

            const message = await thread.send({
                embeds: [embed],
                components: [row],
            });

            // Save thread to DB
            await pool.query(
                "INSERT INTO admin_threads (player_id, thread_id, status) VALUES ($1, $2, 'open')",
                [player_id, thread.id]
            );

            // Create thread instance and start it
            const adminThread = new AdminThread(player_id, thread.id, channel_id, client, pool, config);
            activeThreads.push(adminThread); // Add thread to activeThreads
            adminThread.start();
        }
    });

    // Handle button interaction for closing threads
    client.on("interactionCreate", async (interaction) => {
        try {
            if (!interaction.isButton()) return;
    
            console.log("🧩 Interaction detected:", interaction.customId);
    
            if (interaction.customId.startsWith("close_thread_")) {
                const player_id = interaction.customId.slice("close_thread_".length); // Extract the player ID
                console.log(`🧩 Button interaction detected: close_thread for player ${player_id}`);
    
                console.log("🧩 Attempting to find admin thread...");
                const adminThread = activeThreads.find((t) => t.player_id === player_id);
    
                if (!adminThread) {
                    console.warn("🧩 Admin thread not found for player ID:", player_id);
                    console.log("🧩 Current activeThreads state:", JSON.stringify(activeThreads, null, 2));
    
                    await interaction.reply({
                        content: "Thread not found. Please try again or contact an admin.",
                        ephemeral: true,
                    });
                    return;
                }
    
                console.log(`🧩 Found admin thread for player ${player_id}. Closing thread...`);
                await adminThread.close("Thread closed by admin.", interaction);
    
                // Remove the thread from activeThreads
                const threadIndex = activeThreads.findIndex((t) => t.player_id === player_id);
                if (threadIndex > -1) {
                    console.log(`🧩 Removing thread at index ${threadIndex} from activeThreads.`);
                    activeThreads.splice(threadIndex, 1);
                } else {
                    console.warn("🧩 Thread index not found in activeThreads for player ID:", player_id);
                }
    
                console.log(`🧩 Thread successfully closed for player ${player_id}.`);
            } else {
                console.warn("🧩 Unexpected customId format detected:", interaction.customId);
            }
        } catch (error) {
            console.error("🧩 Critical error in button interaction handler:", error);
    
            // Attempt to reply with an error message (safeguarded)
            try {
                await interaction.reply({
                    content: "An unexpected error occurred while handling your request. Please try again later.",
                    ephemeral: true,
                });
            } catch (replyError) {
                console.error("🧩 Error sending fallback interaction reply:", replyError);
            }
        }
    });
};
