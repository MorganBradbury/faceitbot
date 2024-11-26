import axios, { AxiosInstance } from "axios";
import { FACEIT_API_KEY } from "../config";
import { FaceitPlayer } from "../types/FaceitPlayer";
import { validateAndExtract } from "../utils/generalUtils";

class FaceitApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://open.FACEIT.com/data/v4",
      headers: { Authorization: `Bearer ${FACEIT_API_KEY}` },
    });
  }

  /**
   * Fetch player data by nickname (default method).
   * @param faceitNickname - The FACEIT player's nickname.
   * @returns Player data (FaceitPlayer) or null if invalid data.
   */
  async getPlayerData(faceitNickname: string): Promise<FaceitPlayer | null> {
    try {
      const response = await this.client.get(
        `/players?nickname=${faceitNickname}`
      );
      const cs2Data = validateAndExtract<FaceitPlayer>(
        response.data?.games?.cs2,
        ["skill_level", "faceit_elo", "game_player_id"]
      );

      if (!cs2Data) {
        console.warn(`Invalid or incomplete data for ${faceitNickname}`);
        return null;
      }

      return cs2Data;
    } catch (error) {
      console.error(`Error fetching FACEIT data for ${faceitNickname}:`, error);
      return null;
    }
  }

  /**
   * Fetch player data by game player ID.
   * @param game - The name of the game (e.g., 'cs2', 'csgo').
   * @param gamePlayerId - The unique game player ID.
   * @returns Player data (FaceitPlayer) or null if invalid data.
   */
  async getPlayerDataById(gamePlayerId: string): Promise<FaceitPlayer | null> {
    try {
      const response = await this.client.get(`/players`, {
        params: {
          game: "cs2",
          game_player_id: gamePlayerId,
        },
      });

      // Validate and extract the player data from the response.
      const gameData = validateAndExtract<FaceitPlayer>(
        response.data?.games?.["cs2"],
        ["skill_level", "faceit_elo"]
      );

      if (!gameData) {
        console.warn(
          `Invalid or incomplete data for game player ID: ${gamePlayerId}`
        );
        return null;
      }

      return gameData;
    } catch (error) {
      console.error(
        `Error fetching FACEIT data for game player ID ${gamePlayerId}:`,
        error
      );
      return null;
    }
  }
}

export const faceitApiClient = new FaceitApiClient();
