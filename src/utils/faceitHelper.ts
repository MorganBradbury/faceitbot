import { SystemUser } from "../types/SystemUser";
import { getAllUsers } from "../db/commands";
import { FaceitService } from "../api/services/FaceitService";

export const getTrackedPlayers = async (teams: any): Promise<SystemUser[]> => {
  const allTrackedUsers = await getAllUsers();
  console.log("ALL TRACKED USERS", allTrackedUsers);
  const allMatchPlayers = [...teams.faction1.roster, ...teams.faction2.roster];
  console.log("ALL MATCH PLAYERS", allMatchPlayers);
  const trackedPlayers = allTrackedUsers.filter((user: SystemUser) =>
    allMatchPlayers.some(
      (matchPlayer) => user.faceitId === matchPlayer.player_id
    )
  );

  return trackedPlayers;
};

export const getTeamFaction = async (
  teams: any
): Promise<{ teamId: string; faction: string }> => {
  const allTrackedUsers = await getAllUsers();
  const trackedPlayers = allTrackedUsers.filter((user: SystemUser) =>
    teams.faction1.roster
      .map((player: any) => player.player_id)
      .includes(user.faceitId)
  );

  const faction: "faction1" | "faction2" =
    trackedPlayers.length > 0 ? "faction1" : "faction2";

  return {
    teamId: teams[faction].faction_id,
    faction,
  };
};

export const calculateEloDifference = async (
  previous: number,
  gamePlayerId: string
) => {
  const player = await FaceitService.getPlayer(gamePlayerId);

  if (!player) {
    console.log("Could not find player by ID", gamePlayerId);
    return null;
  }

  let eloNumbers = [previous, player.faceitElo];
  const didPlayerGain = player.faceitElo > previous;
  eloNumbers = didPlayerGain ? eloNumbers : eloNumbers.reverse();

  return {
    operator: didPlayerGain ? "+" : "-",
    difference: eloNumbers[1] - eloNumbers[0],
    newElo: player.faceitElo,
  };
};