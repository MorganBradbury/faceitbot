import { ChatInputCommandInteraction } from "discord.js"; // Use specific interaction type
import { addUser } from "../db/models/commands";
import { updateNickname } from "../utils/nicknameUtils";
import { faceitApiClient } from "../services/FaceitService";
import { FaceitPlayer } from "../types/FaceitPlayer";

export const registerTrackingCommand = {
  name: "ducky_track_elo",
  description:
    "Update your Faceit level in your nickname. This command is case sensitive. You only need to do this command once and you will be added to the tracking list.",
  options: [
    {
      name: "faceit_username",
      description: "Your Faceit nickname",
      type: 3, // STRING type
      required: true,
    },
  ],
  execute: async (interaction: ChatInputCommandInteraction) => {
    const faceitName = interaction.options.getString("faceit_username", true); // Now correctly typed
    const discordUsername = interaction.user.tag;
    try {
      const player: FaceitPlayer | null = await faceitApiClient?.getPlayerData(
        faceitName
      );

      if (player) {
        await addUser(
          discordUsername,
          faceitName,
          player.faceit_elo,
          player.game_player_id
        ).then(async () => {
          //@ts-ignore
          await updateNickname(interaction.member, player);
          await interaction.reply({
            content:
              "☑️ Your elo will now be tracked and updated automatically.",
            ephemeral: true, // This ensures the message is only visible to the user
          });
          console.log(
            `☑️ Your elo will now be tracked and updated automatically! ${discordUsername} ${faceitName}`
          );
        });
      } else {
        await interaction.reply(
          "Invalid Faceit nickname. Please make sure you are entering your name correctly. It is CASE SENSITIVE"
        );
      }
    } catch (error) {
      console.error("Error updating Faceit level:", error);
      await interaction.reply(`Failed. ${error}`);
    }
  },
};
