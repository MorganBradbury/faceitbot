import {
  checkMatchExists,
  getAllUsers,
  getMatchCount,
  getMatchDataFromDb,
  insertMatch,
  isMatchProcessed,
  markMatchComplete,
  updateMatchProcessed,
} from "../../db/dbCommands";
import { FaceitService } from "./faceitService";
import {
  aggregateEnemyFactionData,
  formatMapData,
  getScoreStatusText,
} from "../../utils/faceitHelper";
import { updateVoiceChannelStatus } from "./channelService";
import {
  createLiveScoreCard,
  createMatchAnalysisEmbed,
  matchEndNotification,
  updateLeaderboardEmbed,
} from "./embedService";
import { runEloUpdate } from "./userService";
import axios from "axios";

export const startMatch = async (matchId: string) => {
  console.log("Processing startMatch()", matchId);

  const doesMatchExist = await checkMatchExists(matchId);
  if (doesMatchExist) {
    console.log(`Match ${matchId} already exists in DB.`);
    return;
  }

  // Retrieve initial match data from FACEIT API.
  let match = await FaceitService.getMatch(matchId);
  console.log("match loaded in from api", match);
  if (!match) {
    console.log(`No Match or players found for ${matchId}`);
    return;
  }

  // If the players are in a voice channel. Create a JS Worker to update the live score in the status of the channel.
  if (match?.voiceChannelId) {
    const scoreStatus = await getScoreStatusText(match.mapName);
    await updateVoiceChannelStatus(match.voiceChannelId, scoreStatus);
  }

  await createLiveScoreCard(match);

  const matchCount = await getMatchCount();
  if (matchCount === 0) {
    await axios.post(
      "https://live-game-service-production.up.railway.app/api/start"
    );
  }

  await insertMatch(match);
};

export const endMatch = async (matchId: string) => {
  try {
    console.log("Processing endMatch()", matchId);

    const isMatchAlreadyProcessed = await isMatchProcessed(matchId);
    if (isMatchAlreadyProcessed) {
      return;
    }

    let match = await getMatchDataFromDb(matchId);

    if (!match) {
      return;
    }

    await updateMatchProcessed(matchId);
    await markMatchComplete(matchId);

    try {
      const matchCount = await getMatchCount();
      console.log("match count in endMatch", matchCount);
      if (matchCount === 0) {
        await axios.post(
          "https://live-game-service-production.up.railway.app/api/end"
        );
      }
      console.log("sent request to worker service to end", matchId);
    } catch (error) {
      console.log("Request failed to live game service for", matchId);
    }

    await matchEndNotification(match);
    await runEloUpdate(match.trackedTeam.trackedPlayers);

    if (match?.voiceChannelId) {
      await updateVoiceChannelStatus(match.voiceChannelId, "");
    }

    await updateLeaderboardEmbed();
  } catch (error) {
    console.log(error);
  }
};

export const cancelMatch = async (matchId: string) => {
  console.log("Processing cancelMatch()", matchId);

  let match = await getMatchDataFromDb(matchId);
  if (!match) {
    console.log("No match data found from DB", match);
    return;
  }

  if (match?.voiceChannelId) {
    await updateVoiceChannelStatus(match.voiceChannelId, "");
  }

  // Mark match as complete in the database
  await markMatchComplete(matchId);
  // Stop the worker associated with this matchId
  try {
    const matchCount = await getMatchCount();
    console.log("match count in cancelMatch", matchCount);
    if (matchCount === 0) {
      await axios.post(
        "https://live-game-service-production.up.railway.app/api/end"
      );
    }
    console.log("sent request to worker service to end", matchId);
  } catch (error) {
    console.log("Request failed to live game service for", matchId);
  }
};

export const getMatchAnalysis = async (matchId: string): Promise<any> => {
  if (await checkMatchExists(matchId)) {
    return;
  }

  const matchroomPlayers = await FaceitService.getMatchPlayers(matchId);
  if (!matchroomPlayers?.homeFaction) return;

  const allTrackedUsers = await getAllUsers();
  const trackedFaceitIds = new Set(
    allTrackedUsers.map((user) => user.faceitId)
  );

  // Calculate total tracked users in the game
  const totalTrackedInGame =
    matchroomPlayers?.homeFaction?.filter((player) =>
      trackedFaceitIds.has(player.playerId)
    ).length || 0;

  // Check if there is a captain among the tracked users
  const isCaptainInGame = matchroomPlayers?.homeFaction?.some(
    (player) => trackedFaceitIds.has(player.playerId) && player.captain
  );

  if (totalTrackedInGame < 2 && !isCaptainInGame) {
    console.log(
      `Match only contains ${totalTrackedInGame} tracked users, so not sending analysis`,
      matchId
    );
    return;
  }

  const enemyFactionMapData = await aggregateEnemyFactionData(
    matchroomPlayers.enemyFaction
  );
  if (!enemyFactionMapData) return;

  const formattedMapData = formatMapData(
    enemyFactionMapData.mapStats,
    matchroomPlayers.enemyFaction.length
  );

  createMatchAnalysisEmbed(matchId, matchroomPlayers, formattedMapData);
};
