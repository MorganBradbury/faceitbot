import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { minecraftActivePlayers } from "../../../api/services/minecraft-service";

export const getActivePlayers = {
  name: "active_mc_players",
  description: "List all users currently on the Minecraft server",
  options: [],
  execute: async (interaction: ChatInputCommandInteraction) => {
    try {
      const users = await minecraftActivePlayers();

      if (users === null || users.length === 0) {
        await interaction.reply({
          content: "No players are currently on the server",
          ephemeral: true,
        });
        return;
      }

      const userList = users.map((user: any) => `**${user}**`).join("\n");

      const embed = new EmbedBuilder()
        .setTitle("Minecraft server active players")
        .setColor("#00FF00")
        .setDescription(userList);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error("Error fetching minecraft players:", error);
      await interaction.reply({
        content: `Failed to get server players: ${error}`,
        ephemeral: true,
      });
    }
  },
};
