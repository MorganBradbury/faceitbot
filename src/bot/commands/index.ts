import { deleteUserCommand } from "./Faceit/delete-tracking";
import { helpCommand } from "./help";
import { leaderboardCommand } from "./Faceit/leaderboard";
import { getActivePlayers } from "./Minecraft/get-active-players";
import { clearMessagesCommand } from "./Discord/clear-messages";
import { updateNicknameCommand } from "./Discord/set-nickname";
import { listUserIdsCommand } from "./Faceit/list-tracked-ids";
import { matchAnalysisCommand } from "./Faceit/matchroom-analysis";

export const commands = [
  deleteUserCommand,
  helpCommand,
  leaderboardCommand,
  getActivePlayers,
  clearMessagesCommand,
  updateNicknameCommand,
  listUserIdsCommand,
  matchAnalysisCommand,
];

export const commandsMap = new Map(commands.map((cmd) => [cmd.name, cmd]));
