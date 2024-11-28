import express, { Request, Response } from "express";
import { runAutoUpdateElo } from "./auto/autoUpdateElo";
import { faceitApiClient } from "./services/FaceitService";
import { getAllUsers, insertMatch, markMatchComplete } from "./db/commands";
import { config } from "./config";
import {
  sendMatchFinishNotification,
  sendMatchStartNotification,
} from "./services/discordHandler";

const app = express();

// Use the PORT environment variable or default to 3000 for local development
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // No need for body-parser anymore

// Endpoint to trigger Elo update
app.post(
  "/api/autoupdateelo",
  async (req: Request, res: Response): Promise<void> => {
    try {
      console.log("Received request to run auto-update Elo.");
      await runAutoUpdateElo(); // Run the function and wait for its completion
      res
        .status(200)
        .json({ message: "Elo auto-update completed successfully." });
    } catch (error) {
      console.error("Error during auto-update Elo:", error);
      res.status(500).json({ error: "Failed to run auto-update Elo." });
    }
  }
);

// Webhook callback endpoint
app.post("/api/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const receivedData = req.body;
    console.log("Received webhook data:", receivedData);

    if (receivedData?.event == "match_status_ready") {
      const matchData = await faceitApiClient.getMatchDetails(
        receivedData.payload?.id
      );

      console.log("match data retrieved: ", matchData);

      if (matchData) {
        if (!matchData?.results) {
          insertMatch(matchData);
          sendMatchStartNotification(matchData);
        } else {
          markMatchComplete(matchData?.matchId);
          sendMatchFinishNotification(matchData);
        }
      }
    }

    if (receivedData?.event == "match_status_finished") {
    }
    res.status(200).json({ message: "Webhook processed successfully!" });
  } catch (error) {
    console.error("Error handling webhook:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`API server is running on port ${port}`);
});
