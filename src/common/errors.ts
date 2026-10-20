/**
 * A message for the player: something they tried isn't possible ("Your squad is full").
 * The UI shows it as written. Any other error is a bug, and the UI says so.
 */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

/** Why the worker refuses a call: another tab opened a different league (the tab stops). */
export const LEAGUE_CLOSED =
  "This league was closed because another tab opened a different one. Reload the page to open it here.";
