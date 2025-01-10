import {
  updateLinkedRole,
  updateServerRoles,
} from "../../api/services/discord-service";
import { FaceitService } from "../../api/services/faceit-service";
import { addUser } from "../../db/commands";
import { Player } from "../../types/Faceit/player";
import { updateNickname } from "../../utils/nicknameUtils";
import client from "../client";

const monitoredChannelId = "1327303978223931462"; // Replace with the ID of the channel to monitor

// Listen for messages in the server
client.on("messageCreate", async (message) => {
  console.log("message received", message.channel.id);

  // Ignore messages not from the monitored channel
  if (message.channel.id !== monitoredChannelId) return;

  // Ignore messages from the bot itself
  if (message.author.bot) return;

  // Get the Discord tag and message content
  const userTag = message.author.tag; // The user's Discord tag (e.g., username#1234)
  const faceitName = message.content; // The content of the message

  // Log the information
  console.log(`Message from ${userTag}: ${faceitName}`);

  try {
    const player: Player | null = await FaceitService?.getPlayer(faceitName);

    if (!player) {
      // Send an error reply and return early without deleting any message
      await message.reply(
        `Invalid FACEIT nickname. Please make sure you are entering your name correctly. It is CASE SENSITIVE.`
      );
      return;
    }

    if (!message.member) {
      await message.reply(`Something went wrong. No member found.`);
      return;
    }

    // Add the user to the database and update roles/nicknames
    await addUser(
      userTag,
      player.faceitName,
      player.faceitElo,
      player.gamePlayerId,
      player.id
    );
    await updateNickname(message.member, player);
    await updateServerRoles(message.member, player);
    await updateLinkedRole(
      message.member,
      "1327306844581924977",
      "1327302146814775369"
    );

    console.log(`User added to tracker: ${faceitName}`);

    // Now, delete all messages in the channel containing the user's ID
    const channel = message.channel;
    const messages = await channel.messages.fetch({ limit: 100 }); // Adjust the number as needed

    // Find messages to delete: any message containing the user's ID or from the user
    const messagesToDelete = messages.filter(
      (msg) =>
        msg.content.includes(message.author.id) ||
        msg.author.id === message.author.id
    );

    await Promise.all(
      messagesToDelete.map(async (msg) => {
        try {
          // Delete the message itself
          await msg.delete();
          console.log(`Deleted message from ${msg.author.tag}`);

          // If the message is a reply, delete the referenced message as well
          if (msg.reference && msg.reference.messageId) {
            const referencedMessage = await channel.messages.fetch(
              msg.reference.messageId
            );
            if (referencedMessage) {
              await referencedMessage.delete();
              console.log(
                `Deleted referenced message from ${referencedMessage.author.tag}`
              );
            }
          }
        } catch (error) {
          console.error(
            `Error deleting message from ${msg.author.tag}:`,
            error
          );
        }
      })
    );
  } catch (error) {
    console.error("Error processing message:", error);
    await message.reply({ content: `An error occurred: ${error}` });
  }
});
