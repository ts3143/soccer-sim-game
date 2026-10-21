/**
 * The market pages (M6, SPEC §11 Players): Free Agents, with each player's ask and whether
 * he would talk to the user's club; the Transfer Market's listings, offers and loans.
 */
import type {
  FreeAgentsView,
  LoanRow,
  PlayerSearch,
  PlayerSearchRow,
  TransferMarketView,
} from "../../common/api";
import { daysBetween, exactAge } from "../../common/dates";
import type { GameMeta } from "../../common/schema";
import { FFP, transferBanned } from "../finance/ffp";
import { owedAmortisation, owedWages } from "../finance/finance";
import { userOffers } from "../league/market";
import { teamRef } from "./common";
import { loopWorld, openWindow } from "../league/game";
import { openLeague } from "../league/session";
import { contractAsks, marketValue, yearsLeft } from "../market/market";
import { clubRevenue } from "../market/renewals";
import {
  clubBudgets,
  leagueLevel,
  marketSnapshot,
  moodToward,
  seniorsOf,
  squadCost,
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
        nationality: p.nationality,
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

export async function getTransferMarket(lid: number): Promise<TransferMarketView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const world = loopWorld(session, game.season);
  const user = world.clubs.find((c) => c.cid === game.userCid);
  if (!user) throw new Error("The save has no user club");
  const clubs = new Map(world.clubs.map((c) => [c.cid, c]));
  const level = leagueLevel(world, user.leagueId, game.date);
  const budgets = clubBudgets(world, user);
  const offers = userOffers(session);
  const name = (p: { firstName: string; lastName: string }) =>
    `${p.firstName} ${p.lastName}`.trim();
  const age = (birthDate: string) => Math.floor(exactAge(birthDate, game.date));
  const loanRow = (p: (typeof world.players)[number], other: number): LoanRow => ({
    pid: p.pid,
    name: name(p),
    position: p.position,
    age: age(p.birthDate),
    ovr: p.ovr,
    club: teamRef(clubs.get(other)),
    until: p.loan?.until ?? "",
    wageShare: p.loan?.wageShare ?? 0,
  });
  return {
    date: game.date,
    window: openWindow(game.date, game.season),
    budget: {
      transfer: budgets.transfer,
      wageRoom: budgets.wageRoom,
      seniors: seniorsOf(world.players, user.cid).length,
      maxSeniors: TRANSFERS.maxSeniors,
      squadCostRatio:
        (squadCost(world.players, user.cid).total + owedWages(user) + owedAmortisation(user)) /
        Math.max(1, budgets.base),
      ffpLimit: FFP.ratio,
      banned: transferBanned(user, game.date) ? (user.ffp?.bannedUntil ?? null) : null,
      cashFrozen: user.cash < 0,
      owed: owedWages(user),
    },
    squad: world.players
      .filter((p) => p.status === "club" && p.cid === user.cid)
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
      .map((p) => ({
        pid: p.pid,
        name: name(p),
        position: p.position,
        age: age(p.birthDate),
        ovr: p.ovr,
        pot: p.pot,
        value: marketValue(p, game.date, level),
        wage: p.contract?.wage ?? 0,
        expires: p.contract?.expires ?? null,
        listed: p.listed ?? null,
        openBids: offers.filter((o) => o.incoming && o.pid === p.pid && o.status === "open").length,
      })),
    offers,
    loansOut: world.players
      .filter((p) => p.status === "loan" && p.loan?.parentCid === user.cid && p.cid !== null)
      .map((p) => loanRow(p, p.cid as number)),
    loansIn: world.players
      .filter((p) => p.status === "loan" && p.cid === user.cid && p.loan)
      .map((p) => loanRow(p, p.loan?.parentCid ?? -1)),
    released: (user.released ?? []).map((r) => ({
      pid: r.pid,
      name: r.name,
      wage: r.wage,
      until: r.until,
    })),
    fired: Boolean(game.fired),
  };
}

/** The Transfer Market search: other clubs' players (or free agents) by position, league, OVR, age. */
export async function searchPlayers(lid: number, query: PlayerSearch): Promise<PlayerSearchRow[]> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const world = loopWorld(session, game.season);
  const snap = marketSnapshot(world, game.date);
  const q = { minOvr: 0, maxOvr: 99, maxAge: 99, limit: 40, ...query };
  return world.players
    .filter((p) => {
      if (q.freeAgents ? p.status !== "freeAgent" : p.status !== "club" || p.cid === game.userCid)
        return false;
      if (q.position && p.position !== q.position) return false;
      if (q.leagueId && world.clubs.find((c) => c.cid === p.cid)?.leagueId !== q.leagueId) {
        return false;
      }
      if (
        q.name &&
        !`${p.firstName} ${p.lastName}`.toLocaleLowerCase().includes(q.name.toLocaleLowerCase())
      )
        return false;
      if (q.nationality && p.nationality !== q.nationality && p.nationality2 !== q.nationality)
        return false;
      if (q.minPot !== undefined && p.pot < q.minPot) return false;
      if (q.maxWage !== undefined && (p.contract?.wage ?? 0) > q.maxWage) return false;
      if (q.expiring && yearsLeft(p, game.date) !== 1) return false;
      const club = world.clubs.find((c) => c.cid === p.cid);
      if (
        q.maxValue !== undefined &&
        marketValue(p, game.date, snap.leagueLevels.get(club?.leagueId ?? "") ?? 62) > q.maxValue
      )
        return false;
      const age = exactAge(p.birthDate, game.date);
      if (q.minAge !== undefined && age < q.minAge) return false;
      return p.ovr >= q.minOvr && p.ovr <= q.maxOvr && age < q.maxAge + 1;
    })
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, Math.min(100, q.limit))
    .map((p) => {
      const club = world.clubs.find((c) => c.cid === p.cid);
      return {
        pid: p.pid,
        name: `${p.firstName} ${p.lastName}`.trim(),
        position: p.position,
        age: Math.floor(exactAge(p.birthDate, game.date)),
        ovr: p.ovr,
        pot: p.pot,
        nationality: p.nationality,
        club: club?.name ?? null,
        cid: club?.cid ?? null,
        status: p.status,
        value: marketValue(p, game.date, snap.leagueLevels.get(club?.leagueId ?? "") ?? 62),
        wage: p.contract?.wage ?? 0,
        expires: p.contract?.expires ?? null,
        daysFree: p.freeAgentSince ? daysBetween(p.freeAgentSince, game.date) : null,
      };
    });
}
