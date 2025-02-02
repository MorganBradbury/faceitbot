// embedService.ts

import { EmbedBuilder, TextChannel } from "discord.js";
import { config } from "../../../config";
import { EMBED_COLOURS, EMPTY_FIELD, LINKS } from "../../../constants";
import { Match } from "../../../types/Faceit/match";
import { FaceitService } from "../faceit-service";
import {
  checkIfAlreadySent,
  deleteAnalysisEmbeds,
  deleteLiveScoreCard,
  findMatchMessage,
  formatMapInfo,
  generateMapDataTable,
  generatePlayerStatsTable,
  prepareScoreUpdate,
} from "../../../utils/faceitHelper";
import client from "../../../bot/client";
import { getAllUsers } from "../../../db/commands";

export async function sendEmbedMessage(
  embed: EmbedBuilder,
  channelId: string,
  matchId?: string
) {
  try {
    const channel = (await client.channels.fetch(channelId)) as TextChannel;
    if (await checkIfAlreadySent(matchId || null, channel)) {
      console.log(`Embed already sent for matchId: ${matchId}`);
      return;
    }

    return channel.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error("Error sending embedMessage", error);
  }
}

export async function matchEndNotification(match: Match) {
  try {
    const playerStatsData = await FaceitService.getPlayerStats(
      match.matchId,
      match.trackedTeam.trackedPlayers.map((player) => player.faceitId)
    );

    const playerStatsTable = await generatePlayerStatsTable(
      playerStatsData,
      match
    );
    const finalScore = await FaceitService.getMatchScore(
      match.matchId,
      match.trackedTeam.faction,
      true
    );
    const mapWin = await FaceitService.getMatchResult(
      match.matchId,
      match.trackedTeam.faction
    );

    const { formattedMapName, mapEmoji } = formatMapInfo(match.mapName);

    const embed = new EmbedBuilder()
      .setColor(`#${mapWin ? EMBED_COLOURS.MAP_WIN : EMBED_COLOURS.MAP_LOSS}`)
      .setTitle(
        `${mapEmoji}  ${formattedMapName}  (${finalScore.join(":") || "N/A"})`
      )
      .addFields(
        {
          name: "Scoreboard (K/D/A)",
          value: `${playerStatsTable.join("\n")}`,
        },
        {
          name: "Match page",
          value: `[🔗 Link](${LINKS.MATCHROOM}/${match?.matchId})`,
        }
      )
      .setTimestamp();

    await sendEmbedMessage(embed, config.BOT_UPDATES_CHANNEL_ID, match.matchId);
  } catch (error) {
    console.error("Error sending match finish notification:", error);
  }
}

export async function createMatchAnalysisEmbed(
  matchId: string,
  playersData: any,
  gameData: any
) {
  const mapDataTable = generateMapDataTable(gameData);

  const embed = new EmbedBuilder()
    .setTitle(`Map stats (Team ${playersData.homeFaction[0]?.nickname})`)
    .addFields(
      {
        name: `Map stats for other team (Last 50 games)`,
        value:
          "`Map name     | Played | Win % `\n" +
          "`-------------|--------|-------`\n" +
          mapDataTable,
      },
      {
        name: "Match page",
        value: `[🔗 Link](${LINKS.MATCHROOM}/${matchId})`,
      }
    )
    .setFooter({ text: `${matchId}` })
    .setColor(`#${EMBED_COLOURS.ANALYSIS}`)
    .setTimestamp();

  await sendEmbedMessage(embed, config.MATCHROOM_ANALYSIS_CHANNEL_ID, matchId);
}

export async function createLiveScoreCard(match: Match) {
  const homePlayers = match.trackedTeam.trackedPlayers
    .map((player: any) => `${player.faceitUsername}`)
    .join("\n");

  const matchScore = await FaceitService.getMatchScore(
    match.matchId,
    match.trackedTeam.faction,
    false
  );

  const { formattedMapName, mapEmoji } = formatMapInfo(match.mapName);

  const embed = new EmbedBuilder()
    .setTitle(`${mapEmoji}  ${formattedMapName}  (${matchScore.join(":")})`)
    .addFields(
      {
        name: `Players in game`,
        value: homePlayers,
        inline: true,
      },
      EMPTY_FIELD,
      {
        name: "Match page",
        value: `[🔗 Link](${LINKS.MATCHROOM}/${match?.matchId})`,
        inline: true,
      }
    )
    .setFooter({ text: `${match.matchId}` })
    .setColor(`#${EMBED_COLOURS.LIVE_SCORE}`);

  await sendEmbedMessage(
    embed,
    config.BOT_LIVE_SCORE_CARDS_CHANNEL,
    match.matchId
  );
}

export async function updateLiveScoreCard(match: Match) {
  const targetMessage = await findMatchMessage(
    match.matchId,
    config.BOT_LIVE_SCORE_CARDS_CHANNEL
  );

  if (!targetMessage) {
    console.error(`No message found with matchId: ${match.matchId}`);
    return;
  }

  const matchScore = await FaceitService.getMatchScore(
    match.matchId,
    match.trackedTeam.faction,
    false
  );

  const newScore = matchScore.join(":");
  const { shouldUpdate, updatedEmbed } = prepareScoreUpdate(
    targetMessage,
    match,
    newScore
  );

  if (shouldUpdate && updatedEmbed) {
    await targetMessage.edit({ embeds: [updatedEmbed] });
    console.log(`Live score updated for matchId: ${match.matchId}`);
  }
}

export async function deleteMatchCards(
  matchId?: string,
  forceDelete?: boolean
) {
  const channelIDs = [
    config.MATCHROOM_ANALYSIS_CHANNEL_ID,
    config.BOT_LIVE_SCORE_CARDS_CHANNEL,
  ];

  for (const channelId of channelIDs) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`Channel ${channelId} is invalid or not text-based.`);
        continue;
      }

      const messages = await channel.messages.fetch({ limit: 100 });

      if (channelId === config.BOT_LIVE_SCORE_CARDS_CHANNEL) {
        await deleteLiveScoreCard(messages, matchId);
      } else if (channelId === config.MATCHROOM_ANALYSIS_CHANNEL_ID) {
        await deleteAnalysisEmbeds(messages, forceDelete);
      }
    } catch (error) {
      console.error(
        `Failed to process messages in channel ${channelId}:`,
        error
      );
    }
  }
}

export async function sendNewUserNotification(
  userName: string,
  faceitId: string
) {
  const embed = new EmbedBuilder()
    .setTitle(`New user: ${userName}`)
    .addFields(
      { name: "FACEIT ID", value: faceitId },
      {
        name: "🔗 Webhook",
        value: `[Link](${LINKS.WEBHOOK})`,
      }
    )
    .setColor("#c2a042");

  await sendEmbedMessage(embed, config.NEW_USER_CHANNEL);
}

export async function createLeaderboardEmbed() {
  console.log("received in createLeaderboardEmbed");
  const users = await getAllUsers();

  // Sort users by ELO in descending order
  const sortedUsers = users.sort((a, b) => b.previousElo - a.previousElo);

  // Split the sorted users into chunks of 12
  const chunkSize = 12;
  const userChunks = [];
  for (let i = 0; i < sortedUsers.length; i += chunkSize) {
    userChunks.push(sortedUsers.slice(i, i + chunkSize));
  }

  const embed = new EmbedBuilder()
    .setTitle(`Leaderboard (LIVE)`)
    .setColor(`#${EMBED_COLOURS.ANALYSIS}`)
    .setTimestamp();

  // Add the first field with column headings
  embed.addFields({
    name: `Leaderboard`,
    value:
      "`Player                 | Elo  | Change`" +
      "\n" +
      "`-----------------------|------|-------`" +
      "\n" +
      userChunks[0]
        .map((user, index) => {
          const formattedElo = `${user.previousElo.toString().padEnd(4)}`;
          const changeThisWeek = "No change";

          return `\`(${index + 1}) ${user.faceitUsername.padEnd(
            22
          )} | ${formattedElo} | ${changeThisWeek.padEnd(5)}\``;
        })
        .join("\n"),
  });

  // Add remaining fields for each chunk
  for (let i = 1; i < userChunks.length; i++) {
    embed.addFields({
      name: `\u200B`,
      value: userChunks[i]
        .map((user, index) => {
          const formattedElo = `${user.previousElo.toString().padEnd(4)}`;
          const changeThisWeek = "No change";

          return `\`(${
            i * chunkSize + index + 1
          }) ${user.discordUsername.padEnd(
            22
          )} | ${formattedElo} | ${changeThisWeek.padEnd(5)}\``;
        })
        .join("\n"),
    });
  }

  // Send the embed to the channel
  await sendEmbedMessage(embed, config.LEADERBOARD_CHANNEL);
}
