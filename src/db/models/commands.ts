import { dbConfig } from "../../config";
import { User } from "../../types/User";
import mysql from "mysql2/promise";
import { SQL_QUERIES } from "./queries";

// Create a connection pool
const pool = mysql.createPool({ ...dbConfig });

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
  gamePlayerId: string
): Promise<number> => {
  return useConnection(async (connection) => {
    try {
      const [result] = await connection.query(SQL_QUERIES.INSERT_USER, [
        discordUsername,
        faceitName,
        elo,
        gamePlayerId,
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
export const getAllUsers = async (): Promise<User[]> => {
  return useConnection(async (connection) => {
    const [rows] = await connection.query(SQL_QUERIES.SELECT_ALL_USERS);
    return rows as User[];
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

// Update user's FACEIT game player ID
export const updateUserFaceitId = async (
  userId: number,
  gamePlayerId: string
): Promise<boolean> => {
  return useConnection(async (connection) => {
    const [result] = await connection.query(SQL_QUERIES.UPDATE_USER_FACEIT_ID, [
      gamePlayerId,
      userId,
    ]);
    if ((result as any).affectedRows === 0) {
      throw new Error("No rows updated. Check if the userId exists.");
    }
    return true;
  });
};
