/**
 * The user's club pages (M6, SPEC §11 Team): the Youth Academy, and Finances and
 * Facilities (books, cash over the seasons, FFP, budget dials, ticket price, budgets).
 */
import type { AcademyView, ClubFinancesView, FiredView } from "../../common/api";
import { leagueById } from "../../common/config/competitions";
import { exactAge } from "../../common/dates";
import type { GameMeta } from "../../common/schema";
import { clubStrength, effectiveDials } from "../club/standing";
import { FFP, transferBanned } from "../finance/ffp";
import {
  attendance,
  dialCost,
  operatingRevenue,
  owedAmortisation,
  owedWages,
  ticketPrice,
} from "../finance/finance";
import { ticketLocked } from "../league/club";
import { loopWorld } from "../league/game";
import { openLeague } from "../league/session";
import { clubBudgets, seniorsOf, squadCost, TRANSFERS } from "../market/transfers";
import { mustDecideBy, promotionWage } from "../season/offseason";
import { leagueTables, seasonFixtures, teamRef } from "./common";

export async function getAcademy(lid: number): Promise<AcademyView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const world = loopWorld(session, game.season);
  const club = world.clubs.find((c) => c.cid === game.userCid);
  if (!club) throw new Error("The save has no user club");
  const decideBy = `${game.season + 1}-07-01`;
  return {
    date: game.date,
    decideBy,
    seniors: seniorsOf(world.players, club.cid).length,
    maxSeniors: TRANSFERS.maxSeniors,
    youthDial: club.budget.youth,
    players: world.players
      .filter((p) => p.cid === club.cid && p.status === "academy")
      .sort((a, b) => b.pot - a.pot || b.ovr - a.ovr || a.pid - b.pid)
      .map((p) => {
        const [before, now] = p.ratingsHistory.slice(-2);
        return {
          pid: p.pid,
          name: `${p.firstName} ${p.lastName}`.trim(),
          position: p.position,
          secondary: p.secondaryPositions,
          age: Math.floor(exactAge(p.birthDate, game.date)),
          nationality: p.nationality,
          ovr: p.ovr,
          pot: p.pot,
          change: before && now ? now.ovr - before.ovr : null,
          mustDecide: mustDecideBy(p, decideBy),
          wage: promotionWage(world, p, game.date),
        };
      }),
  };
}

const REVENUE_LABELS: Record<string, string> = {
  matchday: "Gate receipts",
  broadcast: "TV money",
  prize: "Prize money",
  commercial: "Sponsorship and merchandise",
  playerSales: "Player sales",
};
const EXPENSE_LABELS: Record<string, string> = {
  wages: "Wages",
  transfers: "Transfer fees",
  coaching: "Coaching",
  youth: "Youth academy",
  medical: "Medical",
  facilities: "Facilities",
};
const DIALS = [
  { key: "coaching", label: "Coaching", what: "How fast every player develops." },
  {
    key: "youth",
    label: "Youth academy",
    what: "How many youngsters join each 1 July, and how good.",
  },
  { key: "medical", label: "Medical", what: "Fewer injuries, quicker recovery, slower decline." },
  {
    key: "facilities",
    label: "Facilities",
    what: "Builds up slowly: bigger crowds and more appeal to players.",
  },
] as const;
/** Ticket prices shown in the price table, as shares of the fair price. */
const PRICE_POINTS = [0.6, 0.8, 1, 1.2, 1.5, 2];

export async function getClubFinances(lid: number): Promise<ClubFinancesView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const world = loopWorld(session, game.season);
  const club = world.clubs.find((c) => c.cid === game.userCid);
  const row = world.clubSeasons.get(game.userCid);
  if (!club || !row) throw new Error("The save has no user club");
  const league = leagueById(session.config.competitions, row.leagueId);
  const budgets = clubBudgets(world, club);
  const rows = session.cache
    .getAll("clubSeasons")
    .filter((r) => r.cid === club.cid)
    .sort((a, b) => a.season - b.season);
  const last = rows.filter((r) => r.season < game.season).at(-1);
  const revenue = Object.entries(row.revenue).map(([kind, amount]) => ({
    kind,
    label: REVENUE_LABELS[kind] ?? kind,
    amount: Math.round(amount ?? 0),
  }));
  const expenses = Object.entries(row.expenses).map(([kind, amount]) => ({
    kind,
    label: EXPENSE_LABELS[kind] ?? kind,
    amount: Math.round(amount ?? 0),
  }));
  const fair = ticketPrice(row.reputation, league);
  const gateAt = (price: number) => {
    const crowd = attendance(club, row.hype, league, 50, 1, price / Math.max(1, fair));
    return { price, attendance: crowd, gate: Math.round(crowd * price) };
  };
  const prices = [...new Set([...PRICE_POINTS.map((f) => Math.round(f * fair)), club.ticketPrice])];
  const effects = effectiveDials(club);
  const income = operatingRevenue(row.revenue) + (row.revenue.playerSales ?? 0);
  const spent = expenses.reduce((sum, e) => sum + e.amount, 0);
  return {
    season: game.season,
    date: game.date,
    team: teamRef(club),
    cash: Math.round(club.cash),
    revenue,
    expenses,
    profit: Math.round(income - spent),
    amortisation: Math.round(row.amortisation ?? 0),
    cashHistory: [
      ...rows
        .filter((r) => r.season < game.season && r.cashEnd !== null)
        .map((r) => ({ season: r.season, cash: Math.round(r.cashEnd ?? 0), current: false })),
      { season: game.season, cash: Math.round(club.cash), current: true },
    ],
    ffp: {
      ratio:
        (squadCost(world.players, club.cid).total + owedWages(club) + owedAmortisation(club)) /
        Math.max(1, budgets.base),
      limit: FFP.ratio,
      lastSeason: last?.squadCostRatio ?? null,
      status: transferBanned(club, game.date) ? "banned" : club.ffp?.warned ? "warned" : "ok",
      bannedUntil: transferBanned(club, game.date) ? (club.ffp?.bannedUntil ?? null) : null,
    },
    budget: {
      transfer: budgets.transfer,
      wageRoom: budgets.wageRoom,
      wageShare: club.wageShare ?? TRANSFERS.budget.wageShare,
      base: budgets.base,
    },
    dials: DIALS.map((d) => ({
      key: d.key,
      label: d.label,
      what: d.what,
      level: club.budget[d.key],
      cost: Math.round(dialCost(club.budget[d.key], budgets.base)),
      effect: Math.round(effects[d.key]),
    })),
    dialCostRange: {
      at0: Math.round(dialCost(0, budgets.base)),
      at100: Math.round(dialCost(100, budgets.base)),
    },
    facilitiesLevel: Math.round(club.facilitiesLevel ?? 50),
    ticket: {
      price: club.ticketPrice,
      fair,
      auto: club.ticketAuto !== false,
      locked: ticketLocked(session),
      capacity: club.capacity,
      curve: prices.sort((a, b) => a - b).map(gateAt),
    },
  };
}

/** The fair (AI) ticket price for the user's club now. */
export async function fairTicketPrice(lid: number): Promise<number> {
  return (await getClubFinances(lid)).ticket.fair;
}

/** The "You're fired" screen: the club that sacked the user, his record, his job offers. */
export async function getJobOffers(lid: number): Promise<FiredView | null> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  if (!game.fired) return null;
  const world = loopWorld(session, game.season);
  const clubs = new Map(world.clubs.map((c) => [c.cid, c]));
  const tables = leagueTables(session, seasonFixtures(session, game.season));
  const positionOf = (cid: number) =>
    tables.flatMap((t) => t.rows).find((r) => r.cid === cid)?.position ?? null;
  const leagueOf = (id: string) => leagueById(session.config.competitions, id);
  const leagueName = (id: string) => leagueOf(id).name;
  const old = clubs.get(game.userCid);
  const row = world.clubSeasons.get(game.userCid);
  if (!old || !row) throw new Error("The save has no user club");
  return {
    date: game.fired.date,
    club: teamRef(old),
    leagueName: leagueName(old.leagueId),
    record: {
      position: positionOf(old.cid),
      played: row.won + row.drawn + row.lost,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
    },
    confidence: Math.round(row.boardConfidence ?? 0),
    offers: game.fired.offers.flatMap((cid) => {
      const club = clubs.get(cid);
      const season = world.clubSeasons.get(cid);
      if (!club) return [];
      return [
        {
          team: teamRef(club),
          leagueName: leagueName(club.leagueId),
          reputation: Math.round(season?.reputation ?? 50),
          strength: Math.round(clubStrength(world.players, cid, game.date) * 10) / 10,
          position: positionOf(cid),
          expectation:
            leagueOf(club.leagueId).board.find((t) => t.id === season?.boardExpectation)?.label ??
            null,
        },
      ];
    }),
  };
}
