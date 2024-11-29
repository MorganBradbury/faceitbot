import { config } from "../config/index";
import { SystemUser } from "../types/SystemUser";
import mysql, { RowDataPacket } from "mysql2/promise";
import { SQL_QUERIES } from "./queries";
import { MatchDetails } from "../types/MatchDetails";

// Create a connection pool
const pool = mysql.createPool({ ...config.MYSQL });

// Helper function for connection handling
const useConnection = async <T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> => {
  const connection = await pool.getConnection();
  try {
    return await callback(connection);
  } finally {
    connection.release();
  }
};

// Add a new user
export const addUser = async (
  discordUsername: string,
  faceitName: string,
  elo: number,
  gamePlayerId: string,
  playerId: string
): Promise<number> => {
  return useConnection(async (connection) => {
    try {
      const [result] = await connection.query(SQL_QUERIES.INSERT_USER, [
        discordUsername,
        faceitName,
        elo,
        gamePlayerId,
        playerId,
      ]);
      return (result as any).insertId;
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        throw new Error(`You are already on the tracker 😅`);
      }
      throw err;
    }
  });
};

// Update user's Elo
export const updateUserElo = async (
  userId: number,
  newElo: number
): Promise<boolean> => {
  return useConnection(async (connection) => {
    const [result] = await connection.query(SQL_QUERIES.UPDATE_USER_ELO, [
      newElo,
      userId,
    ]);
    if ((result as any).affectedRows === 0) {
      throw new Error("No rows updated. Check if the userId exists.");
    }
    return true;
  });
};

// Retrieve all users
export const getAllUsers = async (): Promise<SystemUser[]> => {
  return useConnection(async (connection) => {
    const [rows] = await connection.query(SQL_QUERIES.SELECT_ALL_USERS);
    return rows as SystemUser[];
  });
};

// Delete a user
export const deleteUser = async (discordUsername: string): Promise<boolean> => {
  return useConnection(async (connection) => {
    const [result] = await connection.query(SQL_QUERIES.DELETE_USER, [
      discordUsername,
    ]);
    if ((result as any).affectedRows === 0) {
      throw new Error("User not found.");
    }
    return true;
  });
};

export const insertMatch = async (
  matchDetails: MatchDetails
): Promise<void> => {
  // Extract values from the matchDetails object
  const { matchId, matchingPlayers, mapName, faction, voiceChannelId } =
    matchDetails;

  if (matchingPlayers.length == 0) {
    console.log(
      "Cannot log this record as no matching players found.",
      matchDetails
    );
    return;
  }

  try {
    // Perform the database insert
    await pool.query(SQL_QUERIES.INSERT_MATCH, [
      matchId,
      JSON.stringify(matchingPlayers), // Store gamePlayerIds as JSON string
      false, // Assuming this is a placeholder for whether the match was finished or not
      mapName, // Map selected for the match
      faction, // Store factionPlayers as JSON string
      voiceChannelId,
    ]);
    console.log(`Match ${matchId} inserted successfully.`);
  } catch (error) {
    console.error(`Error inserting match ${matchId}:`, error);
  }
};

export const markMatchComplete = async (matchId: string): Promise<void> => {
  await pool.query(SQL_QUERIES.UPDATE_MATCH_COMPLETE, [matchId]);
};

export const isMatchComplete = async (matchId: string): Promise<boolean> => {
  return useConnection(async (connection) => {
    const [rows] = await connection.query<any[]>(
      SQL_QUERIES.GET_MATCH_COMPLETE_STATUS,
      [matchId]
    );
    if (!rows) {
      return false;
    }
    return rows[0]?.is_complete === 1; // Returns true if a record is found
  });
};

export const checkMatchExists = async (matchId: string): Promise<boolean> => {
  return useConnection(async (connection) => {
    const [rows] = await connection.query<any[]>(
      SQL_QUERIES.CHECK_MATCH_EXISTS, // Use the query from SQL_QUERIES
      [matchId]
    );
    return rows.length > 0; // Returns true if a record is found
  });
};

// Fetch match details from the database
export const getMatchFromDatabase = async (
  matchId: string
): Promise<MatchDetails | null> => {
  return useConnection(async (connection) => {
    const [rows] = await connection.query<RowDataPacket[]>(
      SQL_QUERIES.GET_MATCH_BY_ID,
      [matchId]
    );
    if (rows.length === 0) {
      return null; // No match found
    }

    // Assuming the columns returned are as expected, format the result
    const matchData = rows[0];
    return {
      matchId: matchData.match_id,
      mapName: matchData.map_name,
      matchingPlayers: JSON.parse(matchData.game_player_ids),
      faction: JSON.parse(matchData.faction),
      voiceChannelId: matchData.voiceChannelId,
    } as MatchDetails;
  });
};
