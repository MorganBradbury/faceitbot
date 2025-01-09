import path from "path";
import { Worker } from "worker_threads";
import {
  checkMatchExists,
  getAllUsers,
  getMatchDataFromDb,
  insertMatch,
  isMatchProcessed,
  markMatchComplete,
  updateMatchProcessed,
} from "../../db/commands";
import {
  createMatchAnalysisEmbed,
  runEloUpdate,
  sendMatchFinishNotification,
  updateVoiceChannelStatus,
} from "./discord-service";
import { FaceitService } from "./faceit-service";
import {
  aggregateEnemyFactionData,
  formatMapData,
  getScoreStatusText,
} from "../../utils/faceitHelper";

let workers: Record<string, Worker> = {};

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
    console.log("worker started for", { matchId, vcid: match?.voiceChannelId });
    const scoreStatus = await getScoreStatusText(match.mapName);
    await updateVoiceChannelStatus(match.voiceChannelId, scoreStatus);
    const worker = new Worker(path.resolve(__dirname, "../worker.js"));
    worker.postMessage({ type: "start", matchId: matchId });
    workers[matchId] = worker;
  }

  await insertMatch(match);
};

export const endMatch = async (matchId: string) => {
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
  // Stop the worker associated with this matchId
  if (workers[matchId]) {
    workers[matchId].postMessage({ type: "stop" });
    workers[matchId].terminate(); // Clean up worker resources
    delete workers[matchId]; // Remove worker from storage
    console.log("Worker stopped for matchId:", matchId);
  }

  // deletes record from DB.
  await markMatchComplete(matchId);
  await sendMatchFinishNotification(match);
  await runEloUpdate(match.trackedTeam.trackedPlayers);

  if (match?.voiceChannelId) {
    await updateVoiceChannelStatus(match.voiceChannelId, "");
  }
};

export const cancelMatch = async (matchId: string) => {
  console.log("Processing cancelMatch()", matchId);

  let match = await getMatchDataFromDb(matchId);
  if (!match) {
    console.log("No match data found from DB", match);
    return;
  }

  // Mark match as complete in the database
  await markMatchComplete(matchId);

  // Stop the worker associated with this matchId
  if (workers[matchId]) {
    workers[matchId].postMessage({ type: "stop" });
    workers[matchId].terminate(); // Clean up worker resources
    delete workers[matchId]; // Remove worker from storage
    console.log("Worker stopped for matchId:", matchId);
  }

  if (match?.voiceChannelId) {
    await updateVoiceChannelStatus(match.voiceChannelId, "");
  }
};

export const getMatchAnalysis = async (matchId: string): Promise<any> => {
  if (await checkMatchExists(matchId)) {
    return;
  }

  const matchroomPlayers = await FaceitService.getMatchPlayers(matchId);
  if (!matchroomPlayers?.homeFaction) return;

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