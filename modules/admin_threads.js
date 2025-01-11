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
        const closedBy = interaction?.user?.username || interaction?.user?.tag || "Unknown";
    
        console.log(`🧩 Closing thread for player ${this.player_id}: ${reason}`);
        this.status = 'closed';
    
        // Clear timers and listeners
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        logStreamManager.removeAllListeners("CHAT");
        this.client.channels.cache.get(this.thread_id)?.removeAllListeners("messageCreate");
    
        // Update DB
        await this.pool.query(
            "DELETE FROM admin_threads WHERE player_id = $1",
            [this.player_id]
        );
    
        // Inform and archive the thread
        const thread = await this.client.channels.fetch(this.thread_id);
        if (thread && thread.isThread()) {
            await thread.send(`This thread has been closed by ${closedBy}. Reason: ${reason}`);
            await thread.setArchived(true); // Archive the thread
            console.log(`🧩 Archived thread ${this.thread_id}`);
        }
    
        // Notify the player in-game
        try {
            await api.message_player({
                player_id: this.player_id,
                message: `Your ticket has been closed by ${closedBy}. If you need further assistance, feel free to create a new report.`,
                by: closedBy,
            });
            console.log(`🧩 Sent closure notification to player ${this.player_id} by ${closedBy}`);
        } catch (error) {
            console.error(`🧩 Error sending closure notification to player ${this.player_id}:`, error);
        }
    
        // Acknowledge the interaction
        if (interaction) {
            await interaction.reply({
                content: "The thread has been closed successfully.",
                ephemeral: true,
            });
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
        if (!interaction.isButton()) return;
    
        if (interaction.customId.startsWith("close_thread_")) {
            const player_id = interaction.customId.slice("close_thread_".length); // Extract the player ID
            console.log(`🧩 Button interaction detected: close_thread for player ${player_id}`);
    
            try {
                const adminThread = activeThreads.find((t) => t.player_id === player_id);
                if (!adminThread) {
                    console.error("🧩 Admin thread not found for player ID:", player_id);
                    console.log("🧩 Active threads:", activeThreads);
                    await interaction.reply({ content: "Thread not found.", ephemeral: true });
                    return;
                }
    
                await adminThread.close("Thread closed by admin.", interaction);
    
                // Remove the thread from activeThreads
                const threadIndex = activeThreads.findIndex((t) => t.player_id === player_id);
                if (threadIndex > -1) activeThreads.splice(threadIndex, 1);
    
                console.log(`🧩 Thread successfully closed for player ${player_id}`);
            } catch (error) {
                console.error("🧩 Error handling thread close button interaction:", error);
                await interaction.reply({ content: "Failed to close the thread. Please try again.", ephemeral: true });
            }
        }
    });
};
