// Initialize the PostgreSQL table
const initializeTable = async (pool) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS channels (
            channelId TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            adminId TEXT NOT NULL,
            bannedUsers TEXT[],
            mutedUsers TEXT[]
        );
    `;
    await pool.query(createTableQuery);
};

const setupCreateChannel = async (client, pool, config, ChannelType) => {
    // Initialize the table
    await initializeTable(pool);

    client.on("voiceStateUpdate", async (oldState, newState) => {
        // Handle user joining the specific voice channel to create a new one
        if (newState.channelId && newState.channelId === config.id) {
            const userId = newState.id;
            const guild = newState.guild;

            // Get the next channel name
            const channelsResult = await pool.query("SELECT name FROM channels ORDER BY name ASC");
            const channels = channelsResult.rows;

            const nextChannelNumber =
                (channels.length > 0
                    ? parseInt(channels[channels.length - 1].name.split(" ")[1])
                    : 0) + 1;
            const newChannelName = `Squad ${nextChannelNumber}`;

            if (!newChannelName) {
                return; // Exit the function to prevent the API call
            }

            if (!config.parentID) {
                console.warn("🧩", 'parent ID is not defined in the configuration.');
                return; // Exit the function or handle appropriately
            }

            // Create new voice channel
            const newChannel = await guild.channels.create({
                name: newChannelName,
                type: ChannelType.GuildVoice,
                parent: config.parentID,
            });

            // Move user to the new channel
            await newState.setChannel(newChannel);

            // Save channel details in the database
            const insertChannelQuery = `
                INSERT INTO channels (channelId, name, adminId, bannedUsers, mutedUsers)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (channelId) DO NOTHING;
            `;
            await pool.query(insertChannelQuery, [
                newChannel.id,
                newChannelName,
                userId,
                [],
                [],
            ]);
        }
    });

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isCommand()) return;

        const { commandName, options } = interaction;
        // Ensure only relevant commands are processed
        if (
            interaction.commandName !== "vckick" &&
            interaction.commandName !== "vcban" &&
            interaction.commandName !== "vcmute" &&
            interaction.commandName !== "vcunmute"
        ) {
            return; // Return early if the command is not for this module
        }

        const user = options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id);
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            await interaction.reply({
                content: `${user.tag} is not in any voice channel.`,
                ephemeral: true,
            });
            return;
        }

        const channelQuery = `
            SELECT * FROM channels WHERE channelId = $1;
        `;
        const channelResult = await pool.query(channelQuery, [voiceChannel.id]);
        const channelData = channelResult.rows[0];

        if (!channelData || channelData.adminid !== interaction.user.id) {
            await interaction.reply({
                content: `You do not have permissions to execute this command in ${voiceChannel.name}.`,
                ephemeral: true,
            });
            return;
        }

        try {
            switch (commandName) {
                case "vckick":
                    await member.voice.disconnect();
                    await interaction.reply({
                        content: `Kicked ${user.tag} from ${voiceChannel.name}.`,
                        ephemeral: true,
                    });
                    break;
                case "vcban":
                    const banQuery = `
                        UPDATE channels
                        SET bannedUsers = array_append(bannedUsers, $1)
                        WHERE channelId = $2;
                    `;
                    await pool.query(banQuery, [user.id, voiceChannel.id]);
                    await member.voice.disconnect();
                    await interaction.reply({
                        content: `Banned ${user.tag} from ${voiceChannel.name}.`,
                        ephemeral: true,
                    });
                    break;
                case "vcmute":
                    await member.voice.setMute(true);
                    const muteQuery = `
                        UPDATE channels
                        SET mutedUsers = array_append(mutedUsers, $1)
                        WHERE channelId = $2;
                    `;
                    await pool.query(muteQuery, [user.id, voiceChannel.id]);
                    await interaction.reply({
                        content: `Muted ${user.tag} in ${voiceChannel.name}.`,
                        ephemeral: true,
                    });
                    break;
                case "vcunmute":
                    await member.voice.setMute(false);
                    const unmuteQuery = `
                        UPDATE channels
                        SET mutedUsers = array_remove(mutedUsers, $1)
                        WHERE channelId = $2;
                    `;
                    await pool.query(unmuteQuery, [user.id, voiceChannel.id]);
                    await interaction.reply({
                        content: `Unmuted ${user.tag} in ${voiceChannel.name}.`,
                        ephemeral: true,
                    });
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.error("Error handling command:", error);
            await interaction.reply({
                content:
                    "Failed to execute the command due to an internal error.",
                ephemeral: true,
            });
        }
    });

    client.on("voiceStateUpdate", async (oldState, newState) => {
        // Auto-kick banned users
        if (newState.channelId) {
            const channelQuery = `
                SELECT * FROM channels WHERE channelId = $1;
            `;
            const channelResult = await pool.query(channelQuery, [newState.channelId]);
            const channelData = channelResult.rows[0];

            if (channelData && channelData.bannedusers.includes(newState.id)) {
                await newState.disconnect();
                console.log(
                    "🧩", `Kicked banned user ${newState.member.user.tag} from ${newState.channel.name}`
                );
            }
        }
    });

    client.on("voiceStateUpdate", async (oldState, newState) => {
        if (!newState.channelId) return; // Ignore if not joining a channel

        const channelQuery = `
            SELECT * FROM channels WHERE channelId = $1;
        `;
        const channelResult = await pool.query(channelQuery, [newState.channelId]);
        const channelData = channelResult.rows[0];

        if (channelData && channelData.mutedusers.includes(newState.id)) {
            const member = await newState.guild.members.fetch(newState.id);
            member.voice.setMute(true);
        }
    });

    client.on("voiceStateUpdate", async (oldState, newState) => {
        // Check if someone leaves a channel
        if (
            oldState.channelId &&
            (!newState.channelId || newState.channelId !== oldState.channelId)
        ) {
            const channel = oldState.guild.channels.cache.get(
                oldState.channelId
            );
            // Make sure the channel still exists and is empty before trying to delete
            if (channel && channel.members.size === 0) {
                const channelQuery = `
                    SELECT * FROM channels WHERE channelId = $1;
                `;
                const channelResult = await pool.query(channelQuery, [oldState.channelId]);
                const channelData = channelResult.rows[0];

                if (channelData) {
                    await channel.delete(); // Delete the channel
                    const deleteQuery = `
                        DELETE FROM channels WHERE channelId = $1;
                    `;
                    await pool.query(deleteQuery, [oldState.channelId]);
                }
            }
        }
    });
};

module.exports = setupCreateChannel;
