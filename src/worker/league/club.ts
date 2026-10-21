/**
 * The user running his club (M6, SPEC §6.2, §6.3, §7.2): academy decisions, the four
 * budget dials and the ticket price. Each action is saved at once.
 */
import type { BudgetDials, GameMeta } from "../../common/schema";
import { promoteAcademyPlayer, releaseAcademyPlayer } from "../season/offseason";
import { assertNotLive, loopWorld, meta, queued, saveTransactions } from "./game";
import type { LeagueSession } from "./session";
import { GameError } from "../../common/errors";
import { formatDay } from "../../common/dates";

function employed(session: LeagueSession): GameMeta {
  const game = meta<GameMeta>(session, "game");
  if (game.fired)
    throw new GameError("You have no club right now: take one of your job offers first.");
  return game;
}

/** True once the user's club has played a home match this season (SPEC §6.2: price locked). */
export function ticketLocked(session: LeagueSession): boolean {
  const game = meta<GameMeta>(session, "game");
  return session.cache
    .getAll("fixtures")
    .some(
      (f) =>
        f.season === game.season && f.homeCid === game.userCid && !f.neutral && f.result !== null,
    );
}

/** Promotes (first pro contract) or releases one of the user's academy players. */
export function decideAcademyPlayer(
  session: LeagueSession,
  pid: number,
  decision: "promote" | "release",
): Promise<string> {
  return queued(session, async () => {
    assertNotLive(session);
    const game = employed(session);
    const world = loopWorld(session, game.season);
    const p = world.players.find((x) => x.pid === pid);
    if (!p || p.cid !== game.userCid) throw new GameError("He isn't in your academy");
    const log =
      decision === "promote"
        ? promoteAcademyPlayer(world, pid, game.season, game.date)
        : releaseAcademyPlayer(world, pid, game.season, game.date);
    for (const x of world.players) if (log.changed.has(x.pid)) session.cache.put("players", x);
    saveTransactions(session, log.transactions);
    await session.cache.flush();
    const name = `${p.firstName} ${p.lastName}`.trim();
    return decision === "promote"
      ? `${name} signs his first professional contract, until ${p.contract ? formatDay(p.contract.expires) : "the end of the season"}.`
      : `${name} leaves the academy.`;
  });
}

/** The user's four budget dials, 0–100 each (SPEC §6.3). Costs change at once. */
export function setBudgetDials(session: LeagueSession, dials: BudgetDials): Promise<void> {
  return queued(session, async () => {
    assertNotLive(session);
    const game = employed(session);
    for (const value of Object.values(dials)) {
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new GameError("Each dial is a whole number from 0 to 100");
      }
    }
    const club = session.cache.get("clubs", game.userCid);
    if (!club) throw new Error("The save has no user club");
    const { coaching, youth, medical, facilities } = dials;
    session.cache.put("clubs", { ...club, budget: { coaching, youth, medical, facilities } });
    await session.cache.flush();
  });
}

/**
 * The user's ticket price for the season (SPEC §6.2, T 2026-10-19): set in preseason, locked
 * after his first home match; null = "Auto", the AI's fair price, set each preseason.
 */
export function setTicketPrice(
  session: LeagueSession,
  price: number | null,
  fair: number,
): Promise<void> {
  return queued(session, async () => {
    assertNotLive(session);
    const game = employed(session);
    if (ticketLocked(session)) {
      throw new GameError("The ticket price is set for this season: change it next preseason");
    }
    const club = session.cache.get("clubs", game.userCid);
    if (!club) throw new Error("The save has no user club");
    if (price !== null && (!Number.isInteger(price) || price < 1 || price > 5 * fair)) {
      throw new GameError(`A ticket costs from €1 to €${5 * fair}`);
    }
    session.cache.put("clubs", {
      ...club,
      ticketPrice: price ?? fair,
      ticketAuto: price === null,
    });
    await session.cache.flush();
  });
}
