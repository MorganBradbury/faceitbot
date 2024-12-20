import { GuildMember } from "discord.js";
import { FaceitPlayer } from "../types/FaceitPlayer";

/**
 * Removes any existing FACEIT level or ELO tag (e.g., "[...]" patterns) from a nickname.
 * @param nickname - The current nickname of the user.
 * @returns The cleaned nickname without any FACEIT level or ELO tags.
 */
function removeExistingTag(nickname: string): string {
  return nickname.replace(/\s?\[.*?\]/, "").trim();
}

/**
 * Helper function to check if the identifier is a nickname.
 * @param identifier - The player identifier to check.
 * @returns True if the identifier is a nickname.
 */
export function isNickname(identifier: string | number): identifier is string {
  return typeof identifier === "string";
}

/**
 * Updates the nickname of a guild member with their FACEIT ELO.
 * @param member - The guild member whose nickname will be updated.
 * @param player - The FACEIT player data containing the ELO.
 */
export async function updateNickname(
  member: GuildMember,
  player: FaceitPlayer | null
): Promise<void> {
  if (!player) return;

  const currentName = member.nickname || member.user.username;
  const cleanName = removeExistingTag(currentName);

  // Calculate the length of the clean name and the ELO to check if the total exceeds 32 characters
  const eloTag = `[${player.faceit_elo}]`;
  const potentialNickname = `${cleanName} ${eloTag}`;

  // If the nickname exceeds 32 characters, use the Discord username instead of the nickname
  let updatedNickname = potentialNickname;
  if (potentialNickname.length > 32) {
    updatedNickname = `${member.user.username} ${eloTag}`;
  }

  try {
    await member.setNickname(updatedNickname);
    console.log(`Updated nickname for ${currentName} to "${updatedNickname}"`);
  } catch (error) {
    console.error(`Failed to update nickname for ${currentName}:`, error);
  }
}
