import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  EmbedBuilder,
  VoiceChannel,
  GuildMember,
  Role,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
  ComponentType,
  Message,
} from "discord.js";
import { SystemUser } from "../../types/SystemUser";
import { FaceitService } from "./FaceitService";
import axios from "axios";
import { PermissionFlagsBits } from "discord.js";
import { config } from "../../config";
import {
  removeExistingTag,
  removeUnicodeChars,
  toUnicodeStr,
  updateNickname,
} from "../../utils/nicknameUtils";
import { getAllUsers, updateUserElo } from "../../db/commands";
import { Player } from "../../types/Faceit/Player";
import { calculateEloDifference } from "../../utils/faceitHelper";
import { Match } from "../../types/Faceit/Match";
import { toUnicode } from "punycode";
import { numberToUnicode } from "../../utils/unicodeHelper";

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates, // Needed for voice channel updates
  ],
  partials: [Partials.Message, Partials.Channel],
});

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
  channelId: string = config.BOT_UPDATES_CHANNEL_ID
) => {
  try {
    if (!client.isReady()) {
      console.error("Discord client is not ready!");
      return;
    }

    const channel = (await client.channels.fetch(channelId)) as TextChannel;

    if (!channel) {
      console.log(
        `Channel with ID ${config.BOT_UPDATES_CHANNEL_ID} not found.`
      );
      return;
    }

    if (channelId === config.MATCHROOM_ANALYSIS_CHANNEL_ID) {
      // Fetch the last 10 messages from the channel
      const messages = await channel.messages.fetch({ limit: 4 });

      // Extract the matchId from the embed footer (using data.footer)
      const matchId = embed.data.footer?.text;

      if (!matchId) {
        console.error("No matchId found in embed footer!");
        return;
      }

      // Check if any of the last 10 messages contain an embed with the same matchId in the footer
      const duplicate = messages.some((message: Message) => {
        return message.embeds.some((embedMsg: any) => {
          console.log(`does ${embed?.data?.footer?.text} include ${matchId}`);
          return embedMsg.footer?.text?.includes(matchId); // Check for matching matchId in the footer
        });
      });

      if (duplicate) {
        console.log("Duplicate embed found, not sending the embed.");
        return;
      }
    }

    // Send the embed with the optional button in the components array
    return channel.send({
      embeds: [embed],
      components, // If components (buttons) are passed, they will be included
    });
  } catch (error) {
    console.error("Error sending message to Discord channel:", error);
  }
};

// Function to get the applicable voice channel based on matching players' usernames
export const getMatchVoiceChannelId = async (
  matchingPlayers: SystemUser[]
): Promise<string | null> => {
  const guild = await client.guilds.fetch(config.GUILD_ID);
  const channels = await guild.channels.fetch();

  for (const [channelId, channel] of channels) {
    if (channel instanceof VoiceChannel) {
      for (const member of channel.members.values()) {
        if (
          matchingPlayers.some(
            (player) => player.discordUsername === member.user.username
          )
        ) {
          return channelId;
        } else {
          return null;
        }
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

const getMapEmoji = (mapName: string): string => {
  const mapEmojis: { [key: string]: string } = {
    de_ancient: "<:de_ancient:1324386141981507656>",
    de_anubis: "<:de_anubis:1324386143462227990>",
    de_dust2: "<:de_dust2:1324386144686702592>",
    de_inferno: "<:de_inferno:1324386146322616392>",
    de_mirage: "<:de_mirage:1324386148369563719>",
    de_nuke: "<:de_nuke:1324386149623529553>",
    de_vertigo: "<:de_vertigo:1324421533262811297>",
    de_train: "<:de_train:1324434992494940231>",
  };

  return mapEmojis[mapName.toLowerCase()] || `:${mapName.toLowerCase()}:`; // Default to text-based emoji if not found
};

export const sendMatchFinishNotification = async (match: Match) => {
  try {
    const getPlayerStatsData = await FaceitService.getPlayerStats(
      match.matchId,
      match.trackedTeam.trackedPlayers.map((player) => player.faceitId)
    );

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
          name: "Players and Stats (K/D/A)",
          value: `${playerStatsTable.join("\n")}`,
        }
      )
      .setFooter({ text: "Match result" })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setURL(`https://www.faceit.com/en/cs2/room/${match.matchId}`)
        .setLabel("View match")
        .setStyle(ButtonStyle.Link)
    );

    await sendEmbedMessage(embed, [row]);
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

/**
 * Updates all voice channels in a Discord server to have the same emoji 🟠 in their names,
 * ignoring specified categories and skipping occupied channels. Channels are reordered alphabetically.
 */
// Helper function to extract the number from the channel name
function extractNumberFromName(channelName: string): number | null {
  const match = channelName.match(/(\d+)/); // Match digits in the name
  return match ? parseInt(match[0], 10) : null;
}

// Helper function to reorder voice channels by their name numbers
async function reorderVoiceChannels(channels: VoiceChannel[]): Promise<void> {
  const sortedChannels = channels.sort((a, b) => {
    const aNumber = extractNumberFromName(a.name);
    const bNumber = extractNumberFromName(b.name);

    // Channels without a number will be pushed to the end
    if (aNumber === null && bNumber === null) return 0;
    if (aNumber === null) return 1;
    if (bNumber === null) return -1;

    return aNumber - bNumber;
  });

  // Set the positions based on the custom sorted order
  await Promise.all(
    sortedChannels.map((channel, index) => {
      if (channel.position !== index) {
        return channel.setPosition(index);
      }
    })
  );
}

export async function resetVoiceChannelStates(): Promise<void> {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      throw new Error("GUILD_ID is not set in environment variables.");
    }

    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error(`Guild with ID ${guildId} not found.`);
    }

    const channels = await guild.channels.fetch();

    // Group channels by category (parentId) and filter voice channels
    const categories: Record<string, VoiceChannel[]> = {};

    channels.forEach((channel) => {
      if (
        channel?.type === ChannelType.GuildVoice &&
        channel.id !== guild.afkChannelId
      ) {
        const categoryId = channel.parentId || "no-category";

        // Skip channels in ignored categories
        if (categoryId !== "no-category") {
          return;
        }

        if (!categories[categoryId]) categories[categoryId] = [];
        categories[categoryId].push(channel as VoiceChannel);
      }
    });

    // Process each category
    for (const [categoryId, voiceChannels] of Object.entries(categories)) {
      const categoryName = voiceChannels[0]?.parent?.name || "Uncategorized";

      // Rename channels based on occupancy and emojis.
      const updatedChannels = await Promise.all(
        voiceChannels.map(async (channel) => {
          let newName: string;
          if (channel.members.size > 0) {
            // Occupied channels: Ensure 🟢 is set
            newName = `🟢 ${channel.name.replace(/^🟠 |^🟢 /, "")}`; // Replace 🟠 or 🟢 with 🟢
          } else {
            // Empty channels: Ensure 🟠 is set
            newName = `🟠 ${channel.name.replace(/^🟠 |^🟢 /, "")}`; // Replace 🟠 or 🟢 with 🟠
          }

          // If the name is different, update it
          if (channel.name !== newName) {
            console.log(`Renaming channel: ${channel.name} -> ${newName}`);
            await channel.setName(newName);
          }

          return channel;
        })
      );

      // Reorder the channels based on their numbers in the names
      await reorderVoiceChannels(updatedChannels);
    }

    console.log("Voice channels updated and reordered successfully.");
  } catch (error) {
    console.error("Error updating voice channels:", error);
  }
}

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

export const updateAllUnicodeNicknames = async () => {
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID); // Fetch the guild
    const members = await guild.members.fetch(); // Fetch all members

    const ownerId = guild.ownerId; // Get the server owner's ID

    // Loop through all members and get their server nickname
    members.forEach(async (member) => {
      // Skip the server owner
      if (member.id === ownerId) {
        return;
      }

      const nickname = member.nickname;
      console.log(`${member.user.tag} has the nickname: ${nickname}`);
      const findUser = await getAllUsers();
      const user = findUser.find(
        (user) => user.discordUsername === member.user.tag
      );

      // You can now modify the nickname if needed
      // Example: modify the nickname and update it
      if (nickname) {
        const newNickname = `${member.nickname} ${toUnicodeStr(
          `[${user?.previousElo}]`
        )}`;

        // If the nickname has changed, update it
        if (newNickname !== nickname) {
          member.setNickname(newNickname);
          console.log(
            `Updated ${member.user.tag}'s nickname to: ${newNickname}`
          );
        }
      }
    });
  } catch (error) {
    console.error("Error fetching members or updating nicknames:", error);
  }
};
export const removeAllUnicodeNicknames = async () => {
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID); // Fetch the guild
    const members = await guild.members.fetch(); // Fetch all members

    const ownerId = guild.ownerId; // Get the server owner's ID

    // Loop through all members and get their server nickname
    members.forEach(async (member) => {
      // Skip the server owner
      if (member.id === ownerId) {
        return;
      }

      const nickname = member.nickname;
      console.log(`${member.user.tag} has the nickname: ${nickname}`);

      // You can now modify the nickname if needed
      // Example: modify the nickname and update it
      if (nickname) {
        const newNickname = removeUnicodeChars(nickname); // Assuming `removeExistingTag` is your function to modify the nickname

        // If the nickname has changed, update it
        if (newNickname !== nickname) {
          member.setNickname(newNickname);
          console.log(
            `Updated ${member.user.tag}'s nickname to: ${newNickname}`
          );
        }
      }
    });
  } catch (error) {
    console.error("Error fetching members or updating nicknames:", error);
  }
};

const getSkillLevelEmoji = (faceitLevel: number): string => {
  const skillLevelEmojis: { [key: number]: string } = {
    1: "<:level_1:1313100283273936896>",
    2: "<:level_2:1313100284301545522>",
    3: "<:level_3:1313100285215903785>",
    4: "<:level_4:1313100286989959180>",
    5: "<:level_5:1313100288512622682>",
    6: "<:level_6:1313100291045851186>",
    7: "<:level_7:1313100292870377523>",
    8: "<:level_8:1313100294321868866>",
    9: "<:level_9:1313100296557432832>",
    10: "<:level_10:1314528913380081717>", // Added level 10 as well
  };

  return skillLevelEmojis[faceitLevel] || `:${faceitLevel}:`; // Default to text-based emoji if not found
};

// Strip 'de_' and capitalize the first letter of the map name
const formattedMapName = (mapName: string) =>
  mapName.replace(/^de_/, "").replace(/\b\w/g, (char) => char.toUpperCase());

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
      { name: "Most likely picks", value: mostLikelyPicks, inline: true },
      { name: "Most likely bans", value: mostLikelyBans, inline: true }
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

const loginBot = async () => {
  try {
    if (!client.isReady()) {
      await client.login(config.DISCORD_BOT_TOKEN);
    }
  } catch (error) {
    console.error("Error logging in to Discord:", error);
  }
};
// Log in to the Discord client
loginBot();
