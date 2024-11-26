import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  GuildMember,
  EmbedBuilder,
} from "discord.js";
import { getAllUsers, updateUserElo } from "../db/models/commands";
import { updateNickname } from "../utils/nicknameUtils";
import { DISCORD_BOT_TOKEN, GUILD_ID, BOT_UPDATES_CHANNEL_ID } from "../config";
import { FaceitPlayer } from "../types/FaceitPlayer";
import { faceitApiClient } from "../services/FaceitService";

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// Helper function for logging errors
const logError = (message: string, error: any) => {
  console.error(message, error);
};

// Main function to update Elo
export const runAutoUpdateElo = async () => {
  try {
    const users = await getAllUsers();
    if (!users.length) return console.log("No users found for update.");

    const guild = await client.guilds.fetch(GUILD_ID); // Cache the guild object
    const memberPromises = users.map(async (user) => {
      const { discordUsername, faceitUsername, previousElo, gamePlayerId } =
        user;

      try {
        const player: FaceitPlayer | null =
          await faceitApiClient.getPlayerDataById(gamePlayerId);

        if (!player || player.faceit_elo === previousElo) return null; // Skip unchanged users

        const member =
          guild.members.cache.find((m) => m.user.tag === discordUsername) ??
          (await guild.members
            .fetch({ query: discordUsername, limit: 1 })
            .then((m) => m.first()));

        if (!member) return null; // Skip if member not found

        await Promise.all([
          updateNickname(member, player),
          updateUserElo(user.userId, player.faceit_elo),
        ]);

        const eloDifference = player.faceit_elo - previousElo;
        const eloChange =
          eloDifference > 0
            ? `🟢 **\`+${eloDifference}\`**`
            : `🔴 **\`-${Math.abs(eloDifference)}\`**`;

        return {
          name: `${discordUsername} (${faceitUsername})`,
          value: `**Elo change:** ${previousElo} > ${player.faceit_elo}\n${eloChange}\n\n`,
        };
      } catch (error) {
        logError(`Error processing user ${discordUsername}:`, error);
        return null; // Skip user on error
      }
    });

    const embedFields = (await Promise.all(memberPromises)).filter(
      (field): field is { name: string; value: string } => field !== null
    ); // Type guard for non-null values

    if (embedFields.length > 0) {
      const channel = (await client.channels.fetch(
        BOT_UPDATES_CHANNEL_ID
      )) as TextChannel;
      const embed = new EmbedBuilder()
        .setTitle("🔔 Automated elo summary")
        .setColor("#00FF00")
        .addFields(embedFields)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }

    console.log("Auto-update completed!");
  } catch (error) {
    logError("Error running auto-update:", error);
  }
};

// Log in to the Discord client
if (!client.isReady()) {
  client.login(DISCORD_BOT_TOKEN).catch(console.error);
}
