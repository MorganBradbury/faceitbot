import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  EmbedBuilder,
  VoiceChannel,
} from "discord.js";
import { MatchDetails } from "../types/MatchDetails";
import { config } from "../config/index";
import { SystemUser } from "../types/SystemUser";
import { faceitApiClient } from "./FaceitService";
import { FaceitPlayer } from "../types/FaceitPlayer";
import axios from "axios";

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

// Helper function to send an embed message to a specific channel
const sendEmbedMessage = async (embed: EmbedBuilder) => {
  try {
    // Ensure the client is logged in before accessing channels
    if (!client.isReady()) {
      console.error("Discord client is not ready!");
      return;
    }

    const channel = (await client.channels.fetch(
      config.BOT_UPDATES_CHANNEL_ID
    )) as TextChannel;

    if (!channel) {
      console.log(
        `Channel with ID ${config.BOT_UPDATES_CHANNEL_ID} not found.`
      );
      return;
    }
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error sending message to Discord channel:", error);
  }
};

// Function to update voice channel name with rate-limit checking
export const updateVoiceChannelName = async (
  voiceChannelId: string,
  matchOngoing: boolean
) => {
  console.log("got into update voice");
  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);

    // Fetch the channel by ID
    const channel = await guild.channels.fetch(voiceChannelId);

    // Check if the channel is a VoiceChannel
    if (channel instanceof VoiceChannel) {
      const newName =
        matchOngoing && channel.members.size > 0 ? "CS [🟢 LIVE]" : "CS";

      // Discord API endpoint for updating channel names
      const url = `https://discord.com/api/v10/channels/${voiceChannelId}`;
      const payload = { name: newName };

      // Make the API call with axios
      const response = await axios.patch(url, payload, {
        headers: {
          Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`, // Your bot token
          "Content-Type": "application/json",
        },
      });

      // Check rate limit headers
      const remaining = response.headers["x-ratelimit-remaining"];
      const reset = response.headers["x-ratelimit-reset"];

      if (remaining === "0") {
        console.log(
          `Rate limit hit! Next request possible at ${new Date(
            parseInt(reset) * 1000
          ).toISOString()}`
        );
      } else {
        console.log(`Updated voice channel name to: ${newName}`);
      }
    } else {
      console.log("The specified channel is not a VoiceChannel.");
    }
  } catch (error) {
    console.error("Error updating voice channel name:", error);
  }
};

// Notify about a match start
export const sendMatchStartNotification = async (
  matchDetails: MatchDetails
) => {
  try {
    console.log("matchdetails", matchDetails);
    const embed = new EmbedBuilder()
      .setTitle("🚨  New Match Started!")
      .setColor("#00A2FF")
      .addFields(
        { name: "Map", value: matchDetails.mapName[0] },
        {
          name: "Match Link",
          value: `[Click here](${`https://www.faceit.com/en/cs2/room/`}${
            matchDetails?.matchId
          })`, // Use markdown for clickable link
        },
        {
          name: "Players",
          value: matchDetails.matchingPlayers
            .map((player) => `${player.faceitUsername}`) // Explicitly type as string
            .join("\n"), // Join players with newline
        }
      )
      .setTimestamp();

    await sendEmbedMessage(embed);
  } catch (error) {
    console.error("Error sending match start notification:", error);
  }
};

// Function to get Elo difference
const getEloDifference = async (previousElo: number, gamePlayerId: string) => {
  const faceitPlayer: FaceitPlayer | null =
    await faceitApiClient.getPlayerDataById(gamePlayerId);
  console.log("faceit api returns", faceitPlayer);
  console.log(previousElo);

  if (!faceitPlayer?.faceit_elo) {
    return;
  }

  if (faceitPlayer.faceit_elo > previousElo) {
    const eloChange = faceitPlayer.faceit_elo - previousElo;
    return `${`**\+${eloChange}\**(${faceitPlayer.faceit_elo})`}`;
  } else {
    const eloChange = previousElo - faceitPlayer?.faceit_elo;
    return `${`**\-${eloChange}\** (${faceitPlayer.faceit_elo})`}`;
  }
};

// Notify about a match finish
export const sendMatchFinishNotification = async (
  matchDetails: MatchDetails
) => {
  try {
    // Resolve all player ELO differences before creating the embed
    const playerDetails = await Promise.all(
      matchDetails.matchingPlayers.map(async (player) => {
        const eloDifference = await getEloDifference(
          player.previousElo,
          player.gamePlayerId
        );
        return `**${player.faceitUsername}**: ${eloDifference || ""}`;
      })
    );

    const embed = new EmbedBuilder()
      .setTitle(
        `🚨  Match finished update (${
          matchDetails.results?.win ? "WIN" : "LOSS"
        })`
      )
      .setColor(matchDetails.results?.win ? "#00FF00" : "#FF0000")
      .addFields(
        { name: "Map", value: matchDetails.mapName[0] },
        {
          name: "Match Link",
          value: `[Click here](${`https://www.faceit.com/en/cs2/room/`}${
            matchDetails?.matchId
          })`, // Use markdown for clickable link
        },
        {
          name: "Match Result",
          value: `${matchDetails.results?.finalScore} (${
            matchDetails.results?.win ? "WIN" : "LOSS"
          })`,
        },
        {
          name: "Players",
          value: playerDetails.join("\n"), // Join resolved player details
        }
      )
      .setTimestamp();

    await sendEmbedMessage(embed);
  } catch (error) {
    console.error("Error sending match finish notification:", error);
  }
};

// Ensure client is logged in before using it
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
