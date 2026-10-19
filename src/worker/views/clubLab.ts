/**
 * M4 Club lab (developer-only; the game screens replace it in M5/M6): every club's money,
 * FFP standing, board and market position, the user's squad and contracts, bids, the
 * season's transfer log and the inbox, plus a market search.
 */
import type {
  ClubLabClubRow,
  ClubLabPlayer,
  ClubLabView,
  PlayerSearch,
  PlayerSearchRow,
} from "../../common/api";
import { daysBetween, exactAge } from "../../common/dates";
import type { GameMeta, Player } from "../../common/schema";
import { contractClub, isSenior } from "../../common/status";
import { operatingRevenue, totalOf } from "../finance/finance";
import { FFP, transferBanned } from "../finance/ffp";
import { loopWorld, openWindow } from "../league/game";
import { userOffers } from "../league/market";
import { openLeague } from "../league/session";
import { loansIn, loansOut } from "../market/loans";
import { marketValue, yearsLeft } from "../market/market";
import { moodAtClub } from "../market/renewals";
import { clubBudgets, marketSnapshot, squadCost } from "../market/transfers";
import { describeTransaction } from "./common";

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();

const TRANSFER_TYPES = new Set(["transfer", "freeAgent", "loan", "renewal", "release"]);

export async function getClubLab(lid: number): Promise<ClubLabView> {
  const session = await openLeague(lid);
  const { cache } = session;
  const game = cache.get("meta", "game") as GameMeta;
  const world = loopWorld(session, game.season);
  const snap = marketSnapshot(world, game.date);
  const lastRows = new Map(
    cache
      .getAll("clubSeasons")
      .filter((r) => r.season === game.season - 1)
      .map((r) => [r.cid, r]),
  );

  const clubs: ClubLabClubRow[] = world.clubs.map((club) => {
    const row = world.clubSeasons.get(club.cid);
    const budgets = clubBudgets(world, club);
    const cost = squadCost(world.players, club.cid);
    const banned = transferBanned(club, game.date);
    return {
      cid: club.cid,
      name: club.name,
      code: club.code,
      leagueId: club.leagueId,
      user: club.cid === game.userCid,
      cash: club.cash,
      budgetBase: budgets.base,
      revenue: row ? operatingRevenue(row.revenue) : 0,
      expenses: row ? totalOf(row.expenses) : 0,
      wages: Math.round(cost.wages),
      amortisation: Math.round(cost.amortisation),
      squadCostRatio: cost.total / Math.max(1, budgets.base),
      lastSquadCostRatio: lastRows.get(club.cid)?.squadCostRatio ?? null,
      ffp: banned ? "banned" : club.ffp?.warned ? "warned" : "ok",
      strategy: snap.strategies.get(club.cid) ?? "developing",
      boardTarget: row?.boardExpectation ?? null,
      confidence: row?.boardConfidence ?? null,
      transferBudget: budgets.transfer,
      wageRoom: budgets.wageRoom,
      seniors: snap.seniors.get(club.cid)?.length ?? 0,
      loansIn: loansIn(world.players, club.cid),
      loansOut: loansOut(world.players, club.cid),
    };
  });

  const user = world.clubs.find((c) => c.cid === game.userCid);
  if (!user) throw new Error("The save has no user club");
  const clubName = (cid: number | null) => world.clubs.find((c) => c.cid === cid)?.name ?? "?";
  const squad: ClubLabPlayer[] = world.players
    .filter(
      (p) =>
        contractClub(p) === user.cid ||
        (p.status === "loan" && p.cid === user.cid) ||
        (p.status === "academy" && p.cid === user.cid),
    )
    .sort((a, b) => Number(isSenior(b)) - Number(isSenior(a)) || b.ovr - a.ovr || a.pid - b.pid)
    .map((p) => {
      const mood = p.status === "academy" ? null : moodAtClub(world, p, game.date, snap.levels);
      const league = world.clubs.find((c) => c.cid === contractClub(p))?.leagueId ?? user.leagueId;
      return {
        pid: p.pid,
        name: fullName(p),
        position: p.position,
        age: Math.floor(exactAge(p.birthDate, game.date)),
        ovr: p.ovr,
        pot: p.pot,
        status: p.status,
        loan:
          p.status === "loan" && p.loan
            ? p.loan.parentCid === user.cid
              ? `to ${clubName(p.cid)} until ${p.loan.until}`
              : `from ${clubName(p.loan.parentCid)} until ${p.loan.until}`
            : null,
        wage: p.contract?.wage ?? 0,
        expires: p.contract?.expires ?? null,
        yearsLeft: yearsLeft(p, game.date),
        value: marketValue(p, game.date, snap.leagueLevels.get(league) ?? 66),
        mood: mood?.value ?? 0,
        willing: mood?.willing ?? true,
        feeRemaining: p.feeBalance?.remaining ?? 0,
      };
    });

  const budgets = clubBudgets(world, user);
  return {
    date: game.date,
    season: game.season,
    window: openWindow(game.date, game.season),
    fired: Boolean(game.fired),
    user: {
      cid: user.cid,
      name: user.name,
      code: user.code,
      budget: {
        transfer: budgets.transfer,
        wageRoom: budgets.wageRoom,
        squadCostRatio: budgets.squadCost / Math.max(1, budgets.base),
        ffpLimit: FFP.ratio,
        warned: user.ffp?.warned ?? false,
        bannedUntil: transferBanned(user, game.date) ? (user.ffp?.bannedUntil ?? null) : null,
      },
      wageShare: user.wageShare ?? 0.5,
    },
    clubs,
    squad,
    offers: userOffers(session),
    transfers: cache
      .getAll("transactions")
      .filter((t) => t.season === game.season && TRANSFER_TYPES.has(t.type))
      .sort((a, b) => b.xid - a.xid)
      .slice(0, 80)
      .map((t) => ({ date: t.date, type: t.type, text: describeTransaction(t), fee: t.fee })),
    inbox: cache
      .getAll("inbox")
      .sort((a, b) => b.mid - a.mid)
      .slice(0, 25),
  };
}

/** Players the user could sign or borrow: at other clubs or free agents, best first. */
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
      const age = exactAge(p.birthDate, game.date);
      return p.ovr >= q.minOvr && p.ovr <= q.maxOvr && age < q.maxAge + 1;
    })
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, Math.min(100, q.limit))
    .map((p) => {
      const club = world.clubs.find((c) => c.cid === p.cid);
      return {
        pid: p.pid,
        name: fullName(p),
        position: p.position,
        age: Math.floor(exactAge(p.birthDate, game.date)),
        ovr: p.ovr,
        pot: p.pot,
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
