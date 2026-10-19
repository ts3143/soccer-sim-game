/**
 * The market pages (M6, SPEC §11 Players): Free Agents, with each player's ask and whether
 * he would talk to the user's club. The Transfer Market follows in chunk 6.
 */
import type { FreeAgentsView } from "../../common/api";
import { daysBetween, exactAge } from "../../common/dates";
import type { GameMeta } from "../../common/schema";
import { transferBanned } from "../finance/ffp";
import { loopWorld, openWindow } from "../league/game";
import { openLeague } from "../league/session";
import { contractAsks, marketValue } from "../market/market";
import { clubRevenue } from "../market/renewals";
import {
  clubBudgets,
  leagueLevel,
  marketSnapshot,
  moodToward,
  seniorsOf,
  TRANSFERS,
} from "../market/transfers";

export async function getFreeAgents(lid: number): Promise<FreeAgentsView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const world = loopWorld(session, game.season);
  const user = world.clubs.find((c) => c.cid === game.userCid);
  if (!user) throw new Error("The save has no user club");
  const snap = marketSnapshot(world, game.date);
  const revenue = clubRevenue(world, user);
  const level = leagueLevel(world, user.leagueId, game.date);
  const budgets = clubBudgets(world, user);
  const rows = world.players
    .filter((p) => p.status === "freeAgent")
    .map((p) => {
      const mood = moodToward(world, p, user, game.date, snap);
      const asks = contractAsks(p, game.date, revenue, mood.value, false);
      return {
        pid: p.pid,
        name: `${p.firstName} ${p.lastName}`.trim(),
        position: p.position,
        secondary: p.secondaryPositions,
        age: Math.floor(exactAge(p.birthDate, game.date)),
        ovr: p.ovr,
        pot: p.pot,
        value: marketValue(p, game.date, level),
        ask: Math.min(...asks.map((a) => a.wage)),
        mood: Math.round(mood.value * 10) / 10,
        willing: mood.willing,
        daysFree: p.freeAgentSince ? daysBetween(p.freeAgentSince, game.date) : 0,
      };
    })
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  return {
    rows,
    wageRoom: budgets.wageRoom,
    seniors: seniorsOf(world.players, user.cid).length,
    maxSeniors: TRANSFERS.maxSeniors,
    windowOpen: openWindow(game.date, game.season) !== null,
    banned: transferBanned(user, game.date) ? (user.ffp?.bannedUntil ?? null) : null,
    fired: Boolean(game.fired),
  };
}
