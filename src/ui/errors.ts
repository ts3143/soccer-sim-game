/**
 * Error text for the player. Messages the game means to show (GameError, e.g. "Your squad
 * is full") read as written; anything else is a bug, said plainly with what to do.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error && error.name === "GameError") return error.message;
  const detail = error instanceof Error ? error.message : String(error);
  return `Something went wrong (${detail}). Reloading the page usually fixes it; your game is saved up to the last thing you did.`;
}
