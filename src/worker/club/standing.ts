/**
 * How a club stands (SPEC §6.1, §6.3): hype (fast, recent results), reputation (slow, a
 * season's finish and trophies), facilities (slow, follows the Facilities dial), and the
 * AI's budget dials.
 *
 * - Hype after every match: + perPoint × (points won − points expected), then a step back
 *   toward the level its reputation supports. Expected points come from the two clubs'
 *   strength (the mean OVR of their 11 best fit seniors) and home advantage.
 * - Reputation at the season's end: a step toward the level the finish supports in that
 *   league (the starting reputation of the club ranked there at the start), plus a bonus
 *   for winning a cup or the play-offs.
 * - Facilities: a step a season toward the Facilities dial. Better facilities fill more
 *   seats (and, from M4 chunk 3, make players keener to sign).
 * - AI dials, each preseason: rich clubs spend more, clubs short of cash less. The user's
 *   club keeps the dials the user set.
 */
import { isSenior } from "../../common/status";
import { clubDefinitions } from "../../common/config/clubs";
import type { CompetitionsConfig } from "../../common/config/competitions";
import { competitionsConfig } from "../../common/config/competitions";
import type { BudgetDials, Club, ClubSeason, Fixture, Player } from "../../common/schema";
import { isInjured } from "../season/squads";

export const STANDING = {
  hype: {
    perPoint: 2.2,
    /** Share of the gap to the reputation level closed after each match. */
    pull: 0.04,
    /** Hype level supported by reputation: 50 + share × (reputation − 50). */
    fromReputation: 0.4,
    /** Strength gap (OVR) that makes a win about 85% likely, and home advantage (OVR). */
    scale: 6,
    home: 1.5,
  },
  reputation: {
    /** Share of the gap to the finish's level closed each season. */
    rate: 0.12,
    trophy: 2,
  },
  facilities: { rate: 0.15, attendance: 0.06 },
  aiDials: { base: 50, perCashShare: 20, min: 35, max: 70 },
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Mean OVR of a club's 11 best fit seniors on `date`. */
export function clubStrength(players: readonly Player[], cid: number, date: string): number {
  const best = players
    .filter((p) => p.cid === cid && isSenior(p) && !isInjured(p, date))
    .map((p) => p.ovr)
    .sort((a, b) => b - a)
    .slice(0, 11);
  return best.reduce((s, x) => s + x, 0) / Math.max(1, best.length);
}

/**
 * Points a club can expect against an opponent `gap` OVR weaker (home advantage included):
 * an ordered logistic with ~26% draws between equal sides and ~85% wins at the `scale` gap.
 */
export function expectedPoints(gap: number): number {
  const spread = STANDING.hype.scale / 2.5;
  const drawBand = 0.53 * spread;
  const win = 1 / (1 + Math.exp(-(gap - drawBand) / spread));
  const loss = 1 / (1 + Math.exp(-(-gap - drawBand) / spread));
  return 3 * win + (1 - win - loss);
}

/** Hype after a played match, for both clubs. */
export function updateHype(
  rows: ReadonlyMap<number, ClubSeason>,
  fixture: Fixture,
  strength: (cid: number) => number,
): void {
  const r = fixture.result;
  if (!r) return;
  const h = STANDING.hype;
  const home = fixture.neutral ? 0 : h.home;
  const gap = strength(fixture.homeCid) - strength(fixture.awayCid) + home;
  const sides: [number, number, number][] = [
    [fixture.homeCid, r.homeGoals - r.awayGoals, gap],
    [fixture.awayCid, r.awayGoals - r.homeGoals, -gap],
  ];
  for (const [cid, margin, g] of sides) {
    const row = rows.get(cid);
    if (!row) continue;
    // A knockout decided on penalties counts as a draw; the winner still goes through.
    const points = margin > 0 ? 3 : margin === 0 ? 1 : 0;
    const level = 50 + h.fromReputation * (row.reputation - 50);
    const next = row.hype + h.perPoint * (points - expectedPoints(g)) + h.pull * (level - row.hype);
    row.hype = Math.round(clamp(next, 0, 100) * 10) / 10;
  }
}

/**
 * Reputation and facilities at the season's end. `finish` is each club's final league
 * position; `trophies` the clubs that won a cup or the play-offs.
 */
export function seasonEndStanding(
  clubs: readonly Club[],
  rows: ReadonlyMap<number, ClubSeason>,
  finish: ReadonlyMap<number, number>,
  trophies: ReadonlySet<number>,
  config: CompetitionsConfig = competitionsConfig,
): void {
  const rep = STANDING.reputation;
  for (const club of clubs) {
    const row = rows.get(club.cid);
    const league = config.leagues.find((l) => l.id === row?.leagueId);
    const pos = finish.get(club.cid);
    if (row && league && pos !== undefined) {
      const level = reputationLadder(league.id)[pos - 1] ?? 50;
      const bonus = trophies.has(club.cid) ? rep.trophy : 0;
      row.reputation = Math.round(
        clamp(row.reputation + rep.rate * (level - row.reputation) + bonus, 1, 100),
      );
    }
    const level = club.facilitiesLevel ?? 50;
    club.facilitiesLevel =
      Math.round(
        (level + STANDING.facilities.rate * (effectiveDials(club).facilities - level)) * 10,
      ) / 10;
  }
}

/**
 * The reputation each league position supports: the league's starting reputations, best
 * first (finishing 5th is worth the 5th-highest starting reputation), so the spread
 * stays as the club data has it while clubs move up and down it.
 */
const ladders = new Map<string, number[]>();
function reputationLadder(leagueId: string): number[] {
  let ladder = ladders.get(leagueId);
  if (!ladder) {
    ladder = clubDefinitions
      .filter((d) => d.league === leagueId)
      .map((d) => d.reputation)
      .sort((a, b) => b - a);
    ladders.set(leagueId, ladder);
  }
  return ladder;
}

/** What a club's dials do: its relative levels (or the dials themselves before they're set). */
export const effectiveDials = (club: Pick<Club, "budget" | "budgetEffect">): BudgetDials =>
  club.budgetEffect ?? club.budget;

/** Sets every club's effective dial levels: 50 ± its distance from the average club. */
export function setEffectiveDials(clubs: readonly Club[]): void {
  const n = Math.max(1, clubs.length);
  const mean = (k: keyof BudgetDials) => clubs.reduce((s, c) => s + c.budget[k], 0) / n;
  const m = {
    coaching: mean("coaching"),
    youth: mean("youth"),
    medical: mean("medical"),
    facilities: mean("facilities"),
  };
  const level = (club: Club, k: keyof BudgetDials) =>
    Math.round(clamp(50 + club.budget[k] - m[k], 0, 100));
  for (const club of clubs) {
    club.budgetEffect = {
      coaching: level(club, "coaching"),
      youth: level(club, "youth"),
      medical: level(club, "medical"),
      facilities: level(club, "facilities"),
    };
  }
}

/** The AI's budget dials for a season, from its cash against its budget base. */
export function aiDials(cash: number, budgetBase: number): BudgetDials {
  const d = STANDING.aiDials;
  const level = Math.round(
    clamp(d.base + d.perCashShare * (cash / budgetBase - 0.3), d.min, d.max),
  );
  return { coaching: level, youth: level, medical: level, facilities: level };
}
