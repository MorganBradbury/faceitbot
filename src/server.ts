import express from "express";
import bodyParser from "body-parser";
import { runAutoUpdateElo } from "./auto/autoUpdateElo";
import { User } from "./types/User";
import { getAllUsers, updateUserFaceitId } from "./db/models/commands";
import { faceitApiClient } from "./services/FaceitService";

const app = express();

// Use the PORT environment variable or default to 3000 for local development
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Endpoint to trigger Elo update
app.post("/api/autoupdateelo", async (req, res) => {
  try {
    console.log("Received request to run auto-update Elo.");
    await runAutoUpdateElo(); // Run the function and wait for its completion
    res
      .status(200)
      .send({ message: "Elo auto-update completed successfully." });
  } catch (error) {
    console.error("Error during auto-update Elo:", error);
    res.status(500).send({ error: "Failed to run auto-update Elo." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`API server is running on port ${port}`);
});
