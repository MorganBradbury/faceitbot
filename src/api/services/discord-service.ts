import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  EmbedBuilder,
  VoiceChannel,
  GuildMember,
  Role,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Message,
  ThreadChannel,
  Interaction,
} from "discord.js";
import { SystemUser } from "../../types/system-user";
import { FaceitService } from "./faceit-service";
import axios from "axios";
import { PermissionFlagsBits } from "discord.js";
import { config } from "../../config";
import { updateNickname } from "../../utils/nicknameUtils";
import { updateUserElo } from "../../db/commands";
import { Player } from "../../types/Faceit/player";
import {
  calculateEloDifference,
  formattedMapName,
} from "../../utils/faceitHelper";
import { Match } from "../../types/Faceit/match";
import { numberToUnicode } from "../../utils/unicodeHelper";
import { ChannelIcons, getMapEmoji, getSkillLevelEmoji } from "../../constants";
import client from "../../bot/client";

// Function to create a new voice channel in a specific category
export const createNewVoiceChannel = async (
  channelName: string,
  parentId: string,
  voiceScoresChannel?: boolean
): Promise<string | null> => {
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);
    if (!guild) {
      console.error("Guild not found");
      return null;
    }

    // Fetch the @everyone role for the guild
    const everyoneRole = guild.roles.everyone;

    // Build the permission overrides based on the flag
    const permissionOverrides = voiceScoresChannel
      ? [
          {
            id: everyoneRole.id, // The @everyone role ID
            deny: [PermissionFlagsBits.Connect], // Use the PermissionFlagsBits enum
          },
        ]
      : undefined; // No overrides if the flag is false

    // Create the new voice channel
    const channel = await guild.channels.create({
      name: channelName,
      type: 2, // 2 = Voice channel
      parent: parentId, // Fixed category ID
      bitrate: 64000,
      permissionOverwrites: permissionOverrides, // Apply overrides conditionally
    });

    console.log(`Created new voice channel: ${channel.name}`);
    return channel.id;
  } catch (error) {
    console.error("Error creating voice channel:", error);
    return null;
  }
};

const sendEmbedMessage = async (
  embed: EmbedBuilder,
  components: any[] = [],
  channelId: string = config.BOT_UPDATES_CHANNEL_ID,
  threadId?: string // Optional thread ID parameter
) => {
  try {
    if (!client.isReady()) {
      console.error("Discord client is not ready!");
      return;
    }

    const channel = (await client.channels.fetch(channelId)) as TextChannel;

    if (!channel) {
      console.log(`Channel with ID ${channelId} not found.`);
      return;
    }

    let targetChannelOrThread: TextChannel | ThreadChannel = channel;

    // If a threadId is provided, fetch the thread and use it as the target
    if (threadId) {
      const thread = await channel.threads.fetch(threadId);
      if (!thread || thread.archived) {
        console.error(`Thread with ID ${threadId} not found or is archived.`);
        return;
      }
      targetChannelOrThread = thread;
    }

    if (channelId === config.MATCHROOM_ANALYSIS_CHANNEL_ID) {
      // Fetch the last 10 messages from the target (channel or thread)
      const messages = await targetChannelOrThread.messages.fetch({
        limit: 10,
      });

      // Extract the matchId from the embed footer (using data.footer)
      const matchId = embed.data.footer?.text;

      if (!matchId) {
        console.error("No matchId found in embed footer!");
        return;
      }

      // Check if any of the last 10 messages contain an embed with the same matchId in the footer
      const duplicate = messages.some((message: Message) => {
        return message.embeds.some((embedMsg: any) => {
          console.log(`Does ${embed?.data?.footer?.text} include ${matchId}?`);
          return embedMsg.footer?.text?.includes(matchId); // Check for matching matchId in the footer
        });
      });

      if (duplicate) {
        console.log("Duplicate embed found, not sending the embed.");
        return;
      }
    }

    // Send the embed with the optional button in the components array
    return targetChannelOrThread.send({
      embeds: [embed],
      components, // If components (buttons) are passed, they will be included
    });
  } catch (error) {
    console.error("Error sending message to Discord channel or thread:", error);
  }
};

// Function to get the applicable voice channel based on matching players' usernames
export const getMatchVoiceChannelId = async (
  matchingPlayers: SystemUser[]
): Promise<string | null> => {
  console.log("matches", matchingPlayers);

  const guild = await client.guilds.fetch(config.GUILD_ID);
  const channels = await guild.channels.fetch();

  // Iterate over channels
  for (const channel of channels.values()) {
    if (channel instanceof VoiceChannel) {
      // Check if any member in this channel matches the condition
      const hasMatchingMember = Array.from(channel.members.values()).some(
        (member) =>
          matchingPlayers.some(
            (player) => player.discordUsername === member.user.username
          )
      );

      if (hasMatchingMember) {
        return channel.id;
      }
    }
  }

  return null;
};

// Function to update voice channel name with rate-limit checking
export const updateVoiceChannelName = async (
  voiceChannelId: string,
  voiceChannelName: string
) => {
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);
    const channel = await guild.channels.fetch(voiceChannelId);

    if (channel instanceof VoiceChannel) {
      const url = `https://discord.com/api/v10/channels/${voiceChannelId}`;
      const payload = { name: voiceChannelName };

      try {
        const response = await axios.patch(url, payload, {
          headers: {
            Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
        });
        console.log(`Updated voice channel name to: ${voiceChannelName}`);
      } catch (error: any) {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers["retry-after"];
          console.error(`Rate limit hit! Retry after ${retryAfter} seconds.`);
        } else {
          throw error;
        }
      }
    } else {
      console.log("The specified channel is not a VoiceChannel.");
    }
  } catch (error) {
    console.error("Error updating voice channel name:", error);
    return;
  }
};

// Function to delete a voice channel by ID
export const deleteVoiceChannel = async (voiceChannelId: string) => {
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);
    if (!guild) {
      console.error("Guild not found");
      return false;
    }

    const channel = await guild.channels.fetch(voiceChannelId);
    if (!channel) {
      console.error(`Channel with ID ${voiceChannelId} not found.`);
      return false;
    }

    if (channel instanceof VoiceChannel) {
      await channel.delete();
      console.log(
        `Voice channel with ID ${voiceChannelId} deleted successfully.`
      );
      return true;
    } else {
      console.error(
        `Channel with ID ${voiceChannelId} is not a voice channel.`
      );
      return false;
    }
  } catch (error) {
    console.error(
      `Error deleting voice channel with ID ${voiceChannelId}:`,
      error
    );
    return false;
  }
};

export const sendMatchFinishNotification = async (match: Match) => {
  try {
    const getPlayerStatsData = await FaceitService.getPlayerStats(
      match.matchId,
      match.trackedTeam.trackedPlayers.map((player) => player.faceitId)
    );

    // Sort players by kills in descending order
    getPlayerStatsData.sort((a: any, b: any) => b.kills - a.kills);

    const playerStatsTable = await Promise.all(
      getPlayerStatsData.map(async (stat) => {
        const player = match.trackedTeam.trackedPlayers.find(
          (player) => player.faceitId === stat.playerId
        );
        const eloChange = await calculateEloDifference(
          player?.previousElo || 0,
          player?.gamePlayerId || ""
        );

        const playerName = player?.faceitUsername || "Unknown";
        const name =
          playerName.length > 11
            ? `${playerName.substring(0, 9)}..`
            : playerName.padEnd(11, " ");

        const kda = `${stat.kills}/${stat.deaths}/${stat.assists}`;
        const paddedKDA = kda.padEnd(8, " ");

        const elo =
          `${eloChange?.operator}${eloChange?.difference} (${eloChange?.newElo})`.padEnd(
            3,
            " "
          );

        return `\`${name} ${paddedKDA}  ${elo}\``;
      })
    );

    const finalScore = await FaceitService.getMatchScore(
      match.matchId,
      match.trackedTeam.faction,
      true
    );
    const didTeamWin = await FaceitService.getMatchResult(
      match.matchId,
      match.trackedTeam.faction
    );

    // Strip 'de_' and capitalize the first letter of the map name
    const formattedMapName = match.mapName
      .replace(/^de_/, "")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    const mapEmoji = getMapEmoji(match.mapName);

    const embed = new EmbedBuilder()
      .setTitle(`New match finished`)
      .setColor(didTeamWin ? "#00FF00" : "#FF0000")
      .addFields(
        {
          name: "Map",
          value: `${mapEmoji}  ${formattedMapName}`,
          inline: true,
        },
        {
          name: "Match Result",
          value: `${finalScore.join(" / ") || "N/A"}`,
          inline: true,
        },

        {
          name: "Link to match",
          value: `[Click here](https://www.faceit.com/en/cs2/room/${match?.matchId})`,
        },
        {
          name: "Players and Stats (K/D/A)",
          value: `${playerStatsTable.join("\n")}`,
        }
      )
      .setFooter({ text: "Match result" })
      .setTimestamp();

    // const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    //   new ButtonBuilder()
    //     .setURL(`https://www.faceit.com/en/cs2/room/${match.matchId}`)
    //     .setLabel("View match")
    //     .setStyle(ButtonStyle.Link)
    // );

    await sendEmbedMessage(embed, [], config.BOT_UPDATES_CHANNEL_ID);
  } catch (error) {
    console.error("Error sending match finish notification:", error);
  }
};

// Main function to update Elo
export const runEloUpdate = async (users: SystemUser[]) => {
  try {
    if (!users.length) {
      console.log("No users provided for update.");
      return;
    }

    const guild = await client.guilds.fetch(config.GUILD_ID); // Cache the guild object

    await Promise.all(
      users.map(async (user) => {
        const { discordUsername, previousElo, gamePlayerId } = user;

        try {
          const player: Player | null = await FaceitService.getPlayer(
            gamePlayerId
          );

          if (!player || player.faceitElo === previousElo) return; // Skip unchanged users

          const member =
            guild.members.cache.find((m) => m.user.tag === discordUsername) ??
            (await guild.members
              .fetch({ query: discordUsername, limit: 1 })
              .then((m) => m.first()));

          if (!member) return; // Skip if member not found

          await Promise.all([
            updateNickname(member, player),
            updateUserElo(user.userId, player.faceitElo),
            updateServerRoles(member, player),
          ]);
        } catch (error) {
          console.log(`Error processing user ${discordUsername}:`, error);
        }
      })
    );

    console.log("Auto-update completed!");
  } catch (error) {
    console.log("Error running auto-update:", error);
  }
};

export const updateServerRoles = async (
  member: GuildMember,
  player: Player
) => {
  try {
    if (!member || !player) {
      console.error("Member or player data is missing.");
      return;
    }

    const guild = await client.guilds.fetch(config.GUILD_ID); // Cache the guild object
    const skillLevelRoleName = `Level ${player.skillLevel}`;

    // Fetch all roles in the guild
    const roles = await guild.roles.fetch();

    // Find the role that matches the current skill level
    const targetRole = roles.find((role) => role.name === skillLevelRoleName);

    if (!targetRole) {
      console.warn(`Role ${skillLevelRoleName} not found in the guild.`);
      return;
    }

    // Remove all roles containing "Level" from the member
    const levelRoles = member.roles.cache.filter((role: Role) =>
      role.name.includes("Level")
    );

    await Promise.all(
      levelRoles.map((role: Role) =>
        member.roles.remove(role).catch(console.error)
      )
    );

    // Assign the correct role based on skill level
    if (!member.roles.cache.has(targetRole.id)) {
      await member.roles.add(targetRole);
      console.log(
        `Assigned role ${skillLevelRoleName} to member ${member.user.tag}.`
      );
    }
  } catch (error) {
    console.error("Error updating server roles:", error);
  }
};

export const updateLinkedRole = async (
  member: GuildMember,
  removeRoleId: string, // Role to remove
  addRoleId: string // Role to add
) => {
  try {
    if (!member) {
      console.error("Member data is missing.");
      return;
    }

    // Get the guild
    const guild = await client.guilds.fetch(config.GUILD_ID);
    if (!guild) {
      console.error("Guild not found.");
      return;
    }

    // Fetch the roles by their IDs
    const removeRole = await guild.roles.fetch(removeRoleId);
    const addRole = await guild.roles.fetch(addRoleId);

    if (!removeRole || !addRole) {
      console.error("One or both roles not found.");
      return;
    }

    // Remove the role if the member has it
    if (member.roles.cache.has(removeRole.id)) {
      await member.roles.remove(removeRole);
      console.log(
        `Removed role ${removeRole.name} from member ${member.user.tag}.`
      );
    }

    // Add the new role
    if (!member.roles.cache.has(addRole.id)) {
      await member.roles.add(addRole);
      console.log(
        `Assigned role ${addRole.name} to member ${member.user.tag}.`
      );
    }
  } catch (error) {
    console.error("Error updating roles:", error);
  }
};

// Function to manage the Minecraft voice channel
export const updateMinecraftVoiceChannel = async (
  playerCount: number // This is the number of active players
): Promise<{ message: string }> => {
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);

    // Dynamically fetch all channels from the guild
    const allChannels = await guild.channels.fetch(); // Fetches all channels directly from Discord

    // Ensure we are working with the correct category ID
    const categoryId = config.MC_CATEGORY_ID;

    // Filter channels that belong to the specified category and are voice channels
    const channelsInCategory = allChannels.filter(
      (channel) =>
        channel &&
        channel.parentId === categoryId &&
        channel.type === 2 && // 2 is for voice channels
        channel.name.includes("ᴘʟᴀʏᴇʀ(ꜱ)") // Only include channels with "PLAYERS" in the name
    );

    // If no active players, delete all voice channels in the category
    if (playerCount === 0) {
      // Check if there are any channels to delete
      if (channelsInCategory.size > 0) {
        console.log("Deleting channels:", channelsInCategory.size);
        for (const channel of channelsInCategory.values()) {
          // Null check before accessing channel properties
          if (channel && channel.id) {
            try {
              console.log(`Deleting channel with ID: ${channel.id}`);
              await deleteVoiceChannel(channel.id); // Delete the channel
            } catch (error) {
              console.error(
                `Failed to delete channel with ID ${channel.id}:`,
                error
              );
            }
          }
        }
        return { message: "All channels deleted due to no active players." };
      } else {
        return {
          message: "No channels to delete, none found in the category.",
        };
      }
    }

    // Create a new voice channel with the active player count
    const channelName = `🟢 ${numberToUnicode(playerCount)} ᴘʟᴀʏᴇʀ(ꜱ)`;
    const existingActiveChannel = channelsInCategory.find(
      (channel: any) => channel && channel.name.startsWith("🟢")
    );

    // If there's an existing ACTIVE channel and its name doesn't match the current player count
    if (existingActiveChannel && existingActiveChannel.name !== channelName) {
      console.log(`Deleting old ACTIVE channel: ${existingActiveChannel.id}`);
      await deleteVoiceChannel(existingActiveChannel.id);

      // Create a new channel with the updated player count
      await createNewVoiceChannel(channelName, categoryId, true);
    } else if (!existingActiveChannel) {
      // If there's no existing ACTIVE channel, create one
      await createNewVoiceChannel(channelName, categoryId, true);
    }

    return { message: "Voice channel updated successfully." };
  } catch (error: any) {
    console.error("Error updating Minecraft voice channel:", error);
    return { message: error.message };
  }
};

export const getChannelNameById = async (
  channelId: string
): Promise<string | null> => {
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);
    const channel = await guild.channels.fetch(channelId);
    if (channel) {
      return channel.name;
    }

    return null;
  } catch (error) {
    console.error("Error fetching channel name by ID:", error);
    return null;
  }
};

export const updateVoiceChannelStatus = async (
  voiceChannelId: string,
  status: string
) => {
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);
    const channel = await guild.channels.fetch(voiceChannelId);

    if (channel instanceof VoiceChannel) {
      const url = `https://discord.com/api/v10/channels/${voiceChannelId}/voice-status`;
      const payload = { status };

      try {
        const response = await axios.put(url, payload, {
          headers: {
            Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
        });
        if (response.status !== 204) {
          console.log(
            `Failed to update voice channel status: ${response.status}`
          );
        }
      } catch (error: any) {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers["retry-after"];
          console.error(`Rate limit hit! Retry after ${retryAfter} seconds.`);
        } else {
          throw error;
        }
      }
    } else {
      console.log("The specified channel is not a VoiceChannel.");
    }
  } catch (error) {
    console.error("Error updating voice channel status:", error);
    return;
  }
};

export const createMatchAnalysisEmbed = (
  matchId: string,
  playersData: any,
  gameData: any
) => {
  // Sorting the game data: first by most played times, then by average win percentage if needed
  const sortedMapData = gameData.sort((a: any, b: any) => {
    const aWinPercentage = parseFloat(a.averageWinPercentage);
    const bWinPercentage = parseFloat(b.averageWinPercentage);

    if (b.totalPlayedTimes === a.totalPlayedTimes) {
      return bWinPercentage - aWinPercentage;
    }
    return b.totalPlayedTimes - a.totalPlayedTimes;
  });

  // Extracting teams and their players
  const homeFaction = playersData.homeFaction;
  const enemyFaction = playersData.enemyFaction;

  const homeFactionCaptain = homeFaction.find((player: any) => player.captain);
  const enemyFactionCaptain = enemyFaction.find(
    (player: any) => player.captain
  );

  // Adding skill level icons next to each player name
  const homePlayers = homeFaction
    .map(
      (player: any) =>
        `${getSkillLevelEmoji(player.faceitLevel)} ${player.nickname}${
          player.captain ? "*" : ""
        }`
    )
    .join("\n");
  const enemyPlayers = enemyFaction
    .map(
      (player: any) =>
        `${getSkillLevelEmoji(player.faceitLevel)} ${player.nickname}${
          player.captain ? "*" : ""
        }`
    )
    .join("\n");

  // Getting most likely picks and bans with map emojis
  const mostLikelyPicks = sortedMapData
    .slice(0, 4)
    .map(
      (map: any) =>
        `${getMapEmoji(map.mapName)} ${formattedMapName(map.mapName)}`
    )
    .join("\n");

  // Sort maps in ascending order of played times for most likely bans
  const mostLikelyBans = sortedMapData
    .slice()
    .sort((a: any, b: any) => a.totalPlayedTimes - b.totalPlayedTimes) // Sort by least played first
    .slice(0, 4) // Take the least played 3 maps
    .map(
      (map: any) =>
        `${getMapEmoji(map.mapName)} ${formattedMapName(map.mapName)}`
    )
    .join("\n");

  // Creating the map stats table content (without map icons)
  const mapDataTable = sortedMapData
    .map((map: any) => {
      // Ensure averageWinPercentage is a valid number by parsing the string to a float
      const formattedWinPercentage =
        map.totalPlayedTimes === 0 ||
        isNaN(parseFloat(map.averageWinPercentage))
          ? "N/A"
          : Math.ceil(parseFloat(map.averageWinPercentage)).toString() + "%"; // Round up the win percentage to nearest whole number
      return `\`${formattedMapName(map.mapName).padEnd(
        12
      )} | ${map.totalPlayedTimes
        .toString()
        .padEnd(6)} | ${formattedWinPercentage.padEnd(6)}\``;
    })
    .join("\n");

  // Create the embed
  const embed = new EmbedBuilder()
    .setTitle("Matchroom Analysis")
    .addFields(
      {
        name: `Team ${homeFactionCaptain.nickname}`,
        value: homePlayers,
        inline: true,
      },
      {
        name: `Team ${enemyFactionCaptain.nickname}`,
        value: enemyPlayers,
        inline: true,
      },
      {
        name: `Map stats for Team ${enemyFactionCaptain.nickname} (Last 30 games)`,
        value:
          "`Map name     | Played | Win % `\n" +
          "`-------------|--------|-------`\n" +
          mapDataTable,
      },
      { name: "They likely pick", value: mostLikelyPicks, inline: true },
      { name: "They likely ban", value: mostLikelyBans, inline: true }
    )
    .setFooter({ text: `${matchId}` })
    .setColor("#ff5733");

  // Create the "View Match" button
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setURL(`https://www.faceit.com/en/cs2/room/${matchId}`)
      .setLabel("View match")
      .setStyle(ButtonStyle.Link)
  );

  // Pass the embed and the button to sendEmbedMessage
  sendEmbedMessage(embed, [row], config.MATCHROOM_ANALYSIS_CHANNEL_ID);
  return;
};

export const createLiveScoreCard = async (match: Match) => {
  // Adding skill level icons next to each player name
  const homePlayers = match.trackedTeam.trackedPlayers
    .map((player: any) => `${player.faceitUsername}`)
    .join("\n");

  const matchScore = await FaceitService.getMatchScore(
    match.matchId,
    match.trackedTeam.faction,
    false
  );

  // Create the embed
  const embed = new EmbedBuilder()
    .setTitle("Live match")
    .addFields(
      {
        name: `Players in game`,
        value: homePlayers,
        inline: true,
      },
      {
        name: `Map`,
        value: `${getMapEmoji(match.mapName)} ${formattedMapName(
          match.mapName
        )}`,
        inline: true,
      },
      {
        name: "Live score",
        value: `${ChannelIcons.Active} ${matchScore.join(":")}`,
      },
      {
        name: "Link to match",
        value: `[Click here](https://www.faceit.com/en/cs2/room/${match?.matchId})`,
      }
    )
    .setFooter({ text: `${match.matchId}` })
    .setColor("#464dd4");

  // Pass the embed and the button to sendEmbedMessage
  sendEmbedMessage(embed, [], config.BOT_LIVE_SCORE_CARDS_CHANNEL);
  return;
};

export const updateLiveScoreCard = async (match: Match) => {
  // Get the Discord client and fetch the channel
  const channel = await client.channels.fetch(
    config.BOT_LIVE_SCORE_CARDS_CHANNEL
  );
  if (!channel || !channel.isTextBased()) {
    console.error("Invalid channel or not a text-based channel.");
    return;
  }

  // Fetch the last 10 messages from the channel
  const messages = await channel.messages.fetch({ limit: 10 });

  // Find the message with the embed containing the matchId in its footer
  const targetMessage = messages.find((message) =>
    message.embeds.some((embed) => embed.footer?.text === match.matchId)
  );

  if (!targetMessage) {
    console.error(`No message found with matchId: ${match.matchId}`);
    return;
  }

  // Retrieve the latest match score
  const matchScore = await FaceitService.getMatchScore(
    match.matchId,
    match.trackedTeam.faction,
    false
  );
  const newScore = `${ChannelIcons.Active} ${matchScore.join(":")}`;

  // Extract the embed and find the current score
  const embed = targetMessage.embeds[0];
  const currentScoreField = embed.fields.find(
    (field) => field.name === "Live score"
  );

  // If the score hasn't changed, skip the update
  if (currentScoreField?.value === newScore) {
    return;
  }

  // Update the embed with the new score
  const updatedEmbed = EmbedBuilder.from(embed).setFields(
    embed.fields.map((field) =>
      field.name === "Live score" ? { ...field, value: newScore } : field
    )
  );

  // Edit the message with the updated embed
  await targetMessage.edit({ embeds: [updatedEmbed] });
  console.log(`Live score updated for matchId: ${match.matchId}`);
};

export const deleteMatchCards = async (matchId: string) => {
  const channelIDs = [
    config.MATCHROOM_ANALYSIS_CHANNEL_ID,
    config.BOT_LIVE_SCORE_CARDS_CHANNEL,
  ];
  for (const channelId of channelIDs) {
    try {
      // Fetch the Discord channel
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`Channel ${channelId} is invalid or not text-based.`);
        continue; // Skip to the next channel
      }

      // Fetch the last 10 messages from the channel
      const messages = await channel.messages.fetch({ limit: 10 });

      // Find the message with the embed containing the matchId in its footer
      const targetMessage = messages.find((message) =>
        message.embeds.some((embed) => embed.footer?.text === matchId)
      );

      if (!targetMessage) {
        continue; // Skip to the next channel
      }

      // Delete the message
      await targetMessage.delete();
      console.log(
        `Live score card deleted for matchId: ${matchId} in channel ${channelId}`
      );
    } catch (error) {
      console.error(
        `Failed to delete match card in channel ${channelId}:`,
        error
      );
    }
  }
};

export async function sendNewUserNotification(
  userName: string,
  faceitId: string
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("New user notification")
    .addFields(
      { name: "User", value: userName },
      { name: "FACEIT ID", value: faceitId },
      {
        name: "🔗 Link to Webhook",
        value:
          "[Click here](https://developers.faceit.com/apps/2205acb7-7fb4-4ce4-8a23-871375ee03fa/webhooks/af22807c-f17a-4947-8829-5757ef6a2e34/edit)",
      }
    )
    .setColor("#c2a042");

  await sendEmbedMessage(embed, [], "1327588452719530027");

  return;
}
