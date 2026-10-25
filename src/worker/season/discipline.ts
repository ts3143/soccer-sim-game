import type { Fixture, Player } from "../../common/schema";
import type { MatchResult } from "../engine/types";

export const isSuspended = (p: Player): boolean => (p.suspension?.remaining ?? 0) > 0;

/** Every this many yellow cards in a season earn a one-match ban (SPEC §8.9). */
export const YELLOWS_PER_BAN = 5;

/** Adds `matches` to a player's ban, issued in the match on `date` (which doesn't serve it). */
function ban(p: Player, matches: number, date: string): void {
  p.suspension = { remaining: (p.suspension?.remaining ?? 0) + matches, date };
}

/**
 * Serve existing bans before issuing new ones, for both simmed and watched matches: a
 * second yellow is one match, a straight red three, every fifth yellow of a season one.
 */
export function applyDiscipline(
  players: readonly Player[],
  fixture: Fixture,
  result: MatchResult,
): number[] {
  const changed: number[] = [];
  for (const p of players) {
    if (p.cid !== fixture.homeCid && p.cid !== fixture.awayCid) continue;
    if (isSuspended(p) && p.suspension && p.suspension.date < fixture.date) {
      p.suspension = { ...p.suspension, remaining: p.suspension.remaining - 1 };
      changed.push(p.pid);
    }
  }
  // A yellow that leads to a second-yellow dismissal is covered by that ban, not counted.
  const sentOff = new Set(
    result.keyEvents.flatMap((e) =>
      e.type === "card" && e.card === "secondYellow" ? [e.pid] : [],
    ),
  );
  for (const event of result.keyEvents) {
    if (event.type !== "card") continue;
    const p = players.find((p) => p.pid === event.pid);
    if (!p) continue;
    if (event.card === "yellow") {
      if (sentOff.has(p.pid)) continue;
      const count = (p.yellows?.season === fixture.season ? p.yellows.count : 0) + 1;
      p.yellows = { season: fixture.season, count };
      if (count % YELLOWS_PER_BAN === 0) ban(p, 1, fixture.date);
    } else {
      ban(p, event.card === "red" ? 3 : 1, fixture.date);
    }
    changed.push(p.pid);
  }
  return changed;
}
