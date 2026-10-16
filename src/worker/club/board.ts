/**
 * The board (SPEC §6.5).
 *
 * - Preseason: each league's clubs are ranked by squad strength; the first targets in
 *   the league's config go to the strongest clubs (e.g. ENG1: 2 title, 4 top four, …).
 * - Confidence (0–100) after every matchday:
 *     live = 0.6 × results + 0.25 × money + 0.15 × hype
 *     results = 50 + 50 × tanh((target position − current position) / 3)
 *     money   = 50 + 50 × tanh(cash / budget base / 0.25)
 *   and confidence = season-start value × (1 − progress) + live × progress, where progress
 *   is the share of the club's league matches played. The next season starts halfway
 *   between the last value and 60.
 * - The user is sacked when confidence falls below 25 once a third of the season is
 *   played, or below 35 at the season's end; he is offered 1–3 jobs at clubs with lower
 *   reputation (the MVP has no managers at other clubs: these are fictional vacancies).
 */
import type { CompetitionsConfig } from "../../common/config/competitions";
import { competitionsConfig } from "../../common/config/competitions";
import type { Club, ClubSeason, Player } from "../../common/schema";
import { Random } from "../core/random";
import type { TableRow } from "../schedule/standings";
import { clubStrength } from "./standing";

export const BOARD = {
  weights: { results: 0.6, money: 0.25, hype: 0.15 },
  /** Positions above or below target that move the results score most of the way. */
  positionScale: 3,
  /** Cash (as a share of the budget base) that moves the money score most of the way. */
  cashScale: 0.25,
  /** New season: confidence starts this share back toward `fresh`. */
  carry: 0.5,
  fresh: 60,
  fireMidSeason: { below: 25, fromProgress: 1 / 3 },
  fireAtSeasonEnd: 35,
  offers: { min: 1, max: 3, reputationBelow: 5 },
};

export interface BoardTargetSet {
  cid: number;
  target: string;
  position: number;
  label: string;
}

/** Preseason targets for one league's clubs from their squad strength. */
export function boardTargets(
  leagueId: string,
  strengths: readonly { cid: number; strength: number }[],
  config: CompetitionsConfig = competitionsConfig,
): BoardTargetSet[] {
  const league = config.leagues.find((l) => l.id === leagueId);
  if (!league) return [];
  const ranked = [...strengths].sort((a, b) => b.strength - a.strength || a.cid - b.cid);
  const out: BoardTargetSet[] = [];
  let i = 0;
  for (const target of league.board) {
    for (let k = 0; k < target.strongest && i < ranked.length; k++, i++) {
      out.push({
        cid: (ranked[i] as { cid: number }).cid,
        target: target.id,
        position: target.position,
        label: target.label,
      });
    }
  }
  return out;
}

/** The position a target id asks for in a league. */
export function targetPosition(
  leagueId: string,
  target: string | null,
  config = competitionsConfig,
) {
  const league = config.leagues.find((l) => l.id === leagueId);
  return league?.board.find((t) => t.id === target)?.position ?? league?.clubs ?? 20;
}

/** Season-start confidence from last season's final value (or a fresh start). */
export const startingConfidence = (last: number | null | undefined): number =>
  last === null || last === undefined
    ? BOARD.fresh
    : Math.round(last + BOARD.carry * (BOARD.fresh - last));

/** Live confidence from the current table, money and hype. */
export function liveConfidence(
  row: ClubSeason,
  club: Club,
  table: readonly TableRow[],
  config: CompetitionsConfig = competitionsConfig,
): number {
  const me = table.find((r) => r.cid === club.cid);
  const target = targetPosition(row.leagueId, row.boardExpectation, config);
  const results =
    me && me.played > 0 ? 50 + 50 * Math.tanh((target - me.position) / BOARD.positionScale) : 50;
  const base = row.budgetBase ?? club.revenueAnchor;
  const money = 50 + 50 * Math.tanh(club.cash / base / BOARD.cashScale);
  const w = BOARD.weights;
  return w.results * results + w.money * money + w.hype * row.hype;
}

/** Updates a club's confidence after a matchday; `progress` = share of league games played. */
export function updateConfidence(
  row: ClubSeason,
  club: Club,
  table: readonly TableRow[],
  progress: number,
  config: CompetitionsConfig = competitionsConfig,
): number {
  const start = row.boardStart ?? BOARD.fresh;
  const p = Math.min(1, Math.max(0, progress));
  const value = start * (1 - p) + liveConfidence(row, club, table, config) * p;
  row.boardConfidence = Math.round(value * 10) / 10;
  return row.boardConfidence;
}

/** True if the board sacks the manager now. */
export function boardSacks(confidence: number, progress: number, seasonOver: boolean): boolean {
  if (seasonOver) return confidence < BOARD.fireAtSeasonEnd;
  return progress >= BOARD.fireMidSeason.fromProgress && confidence < BOARD.fireMidSeason.below;
}

/** 1–3 job offers at clubs with lower reputation than the user's (seeded). */
export function jobOffers(
  clubs: readonly Club[],
  rows: ReadonlyMap<number, ClubSeason>,
  userCid: number,
  seed: string,
  date: string,
): number[] {
  const own = rows.get(userCid)?.reputation ?? 50;
  const o = BOARD.offers;
  const candidates = clubs
    .filter(
      (c) => c.cid !== userCid && (rows.get(c.cid)?.reputation ?? 50) <= own - o.reputationBelow,
    )
    .map((c) => c.cid);
  const rng = Random.fromSeed(`${seed}/jobOffers/${date}`);
  const count = Math.min(candidates.length, rng.int(o.min, o.max));
  return rng.shuffle(candidates).slice(0, count);
}

/**
 * Preseason: every club's board target from its squad strength rank in its league.
 * Returns the message telling the user his target.
 */
export function preseasonBoard(
  world: {
    clubs: readonly Club[];
    players: readonly Player[];
    clubSeasons: ReadonlyMap<number, ClubSeason>;
    userCid: number;
  },
  season: number,
  date: string,
  config: CompetitionsConfig = competitionsConfig,
): {
  date: string;
  season: number;
  kind: string;
  subject: string;
  body: string;
  read: boolean;
} | null {
  let message = null;
  for (const league of config.leagues) {
    const strengths = world.clubs
      .filter((c) => world.clubSeasons.get(c.cid)?.leagueId === league.id)
      .map((c) => ({ cid: c.cid, strength: clubStrength(world.players, c.cid, date) }));
    for (const t of boardTargets(league.id, strengths, config)) {
      const row = world.clubSeasons.get(t.cid);
      if (!row) continue;
      row.boardExpectation = t.target;
      row.boardStart ??= BOARD.fresh;
      row.boardConfidence = row.boardStart;
      if (t.cid === world.userCid) {
        message = {
          date,
          season,
          kind: "board",
          subject: `The board's target: ${t.label.toLowerCase()}`,
          body: `For ${season}/${String((season + 1) % 100).padStart(2, "0")} the board expects you to ${t.label.toLowerCase()} (${league.name}).`,
          read: false,
        };
      }
    }
  }
  return message;
}
