import express, { Request, Response } from "express";
import { runAutoUpdateElo } from "./auto/autoUpdateElo";
import { faceitApiClient } from "./services/FaceitService";
import {
  checkMatchExists,
  insertMatch,
  markMatchComplete,
} from "./db/commands";
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

    if (
      receivedData?.event == "match_status_ready" ||
      receivedData?.event == "match_status_finished"
    ) {
      const matchData = await faceitApiClient.getMatchDetails(
        receivedData.payload?.id
      );
      if (matchData) {
        const matchExists = await checkMatchExists(matchData?.matchId);
        if (!matchExists) {
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
        } else {
          console.log("match already exists");
        }
      }
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
