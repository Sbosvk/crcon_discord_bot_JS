// NEEDS TO CHANGE DB TO SPECIFIC FOR THIS MODULE
// CODE NEEDS REVIEW

const setupCreateChannel = (client, db, config, ChannelType) => {
    client.on("voiceStateUpdate", async (oldState, newState) => {
        // Handle user joining the specific voice channel to create a new one
        if (newState.channelId && newState.channelId === config.id) {
            const userId = newState.id;
            const guild = newState.guild;

            // Get the next channel name
            const channels = await db.find({}).sort({ name: 1 }).exec();
            const nextChannelNumber =
                (channels.length > 0
                    ? parseInt(channels[channels.length - 1].name.split(" ")[1])
                    : 0) + 1;
            const newChannelName = `Squad ${nextChannelNumber}`;

            console.log("Create Channel", "Creating channel with name: " + newChannelName);
            if (!newChannelName) {
                console.error("Channel name is undefined.");
                return; // Exit the function to prevent the API call
            }

            if (!config.parentID) {
                console.error("parentID is not defined in the configuration.");
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
            await db.insert({
                name: newChannelName,
                channelId: newChannel.id,
                adminId: userId,
                bannedUsers: [],
                mutedUsers: [],
            });

            console.log("Create Channel",  
                `Created and moved ${newState.member.user.tag} to ${newChannelName}`
            );
        }
    });

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isCommand()) return;

        const { commandName, options } = interaction;
        // Ensure only relevant commands are processed
        if (interaction.commandName !== "vckick" && interaction.commandName !== "vcban" && 
            interaction.commandName !== "vcmute" && interaction.commandName !== "vcunmute") {
            return; // Return early if the command is not for this module
        }
        console.log("Create Channel: Received command", interaction.commandName);
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

        const channelData = await db.findOne({
            channelId: voiceChannel.id,
        });

        if (!channelData || channelData.adminId !== interaction.user.id) {
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
                    await db.update(
                        { channelId: voiceChannel.id },
                        { $push: { bannedUsers: user.id } }
                    );
                    await member.voice.disconnect();
                    await interaction.reply({
                        content: `Banned ${user.tag} from ${voiceChannel.name}.`,
                        ephemeral: true,
                    });
                    break;
                case "vcmute":
                    await member.voice.setMute(true);
                    await db.update(
                        { channelId: voiceChannel.id },
                        { $push: { mutedUsers: user.id } }
                    );
                    await interaction.reply({
                        content: `Muted ${user.tag} in ${voiceChannel.name}.`,
                        ephemeral: true,
                    });
                    break;
                case "vcunmute":
                    await member.voice.setMute(false);
                    await db.update(
                        { channelId: voiceChannel.id },
                        { $pull: { mutedUsers: user.id } }
                    );
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
            const channelData = await db.findOne({
                channelId: newState.channelId,
            });
            if (channelData && channelData.bannedUsers.includes(newState.id)) {
                await newState.disconnect();
                console.log("Create Channel",  
                    `Kicked banned user ${newState.member.user.tag} from ${newState.channel.name}`
                );
            }
        }
    });

    client.on("voiceStateUpdate", async (oldState, newState) => {
        if (!newState.channelId) return; // Ignore if not joining a channel

        const channelData = await db.findOne({
            channelId: newState.channelId,
        });

        if (channelData && channelData.mutedUsers.includes(newState.id)) {
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
                const channelData = await db.findOne({
                    channelId: oldState.channelId,
                });
                if (channelData) {
                    await channel.delete(); // Delete the channel
                    await db.remove({ channelId: oldState.channelId }); // Remove channel data from DB
                    console.log("Create Channel",  `Deleted empty channel ${channel.name}`);
                }
            }
        }
    });
};

module.exports = setupCreateChannel;
