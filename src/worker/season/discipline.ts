import type { Fixture, Player } from "../../common/schema";
import type { MatchResult } from "../engine/types";

export const isSuspended = (p: Player): boolean => (p.suspension?.remaining ?? 0) > 0;

/** Serve existing bans before issuing new ones, for both simmed and watched matches. */
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
  for (const event of result.keyEvents) {
    if (event.type !== "card" || event.card === "yellow") continue;
    const p = players.find((p) => p.pid === event.pid);
    if (!p) continue;
    p.suspension = {
      remaining: (p.suspension?.remaining ?? 0) + (event.card === "red" ? 3 : 1),
      date: fixture.date,
    };
    changed.push(p.pid);
  }
  return changed;
}
