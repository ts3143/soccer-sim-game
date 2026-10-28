/**
 * Tier mobility for a world of tiers (the Super League, SPEC §17.9): per season what the
 * harness records (final tables, moves, squads at the first match), and the measures over
 * a run: the acceptance (exactly the configured places up and down every season, nobody
 * out of the lowest tier), yo-yo clubs, the rise from the bottom tier to the top, tier
 * mobility, and the world's health (player count, the squads' shape) as Classic's.
 */
import type { CompetitionsConfig } from "../../src/common/config/competitions";
import type { ClubMove } from "../../src/worker/season/season";
import { exactAge } from "../../src/common/dates";
import type { DraftPick, Player } from "../../src/common/schema";
import { preseasonBoard } from "../../src/worker/club/board";
import {
  clubView,
  pickTradeValue,
  squadValue,
  talentValue,
  tradeDay,
  tradeState,
  valueChange,
} from "../../src/worker/market/tradeValue";
import type { LoopWorld } from "../../src/worker/season/offseason";
import type { SeasonReport, SquadShape } from "./world";

export interface TierSeason {
  /** Each league's final table, club IDs top first. */
  tables: Record<string, number[]>;
  moves: ClubMove[];
  /** Seniors at clubs on the season's first league matchday: squad sizes, OVRs, ages. */
  seniors: SquadShape;
  freeAgents: number;
  /**
   * At the season's end (30 June): clubs over their cap (paying luxury tax), the tax they
   * paid in euros, and relegated clubs still over their own cap after their grace.
   */
  cap: { over: number; taxPaid: number; afterGrace: number };
  /** AI-to-AI trades in the season: how many, and the players and picks they moved. */
  trades: { count: number; players: number; picks: number };
}

/** SL5's exploit checks on a run's final world (see `tradeExploits`). */
export interface TradeExploits {
  starsChecked: number;
  /** Offers where two average players equal the star in talent, by squad place. */
  starsEqualled: number;
  /** Offers the star's club would take, contracts and cap room counted. */
  starsBought: number;
  picksChecked: number;
  picksOutOfOrder: number;
}

/** One world's run (plain data: it crosses process boundaries as JSON). */
export interface TierRun {
  seed: string;
  seasons: TierSeason[];
  activeAtStart: number;
  activeAfter: number[];
  /** Retirements of players 30+: age and whether a goalkeeper. */
  retirements: { age: number; gk: boolean }[];
  /** The exploit checks on the final world, and the picks clubs hold then (most, none). */
  exploits: TradeExploits;
  picksHeld: { most: number; none: number };
  seconds: number;
}

/** The season's trades, players and picks moved (picks read from the transactions' words). */
function tradesOf(report: SeasonReport): TierSeason["trades"] {
  const rows = report.days.transactions.filter((t) => t.type === "trade");
  return {
    count: rows.length,
    players: rows.reduce((s, t) => s + t.pids.length, 0),
    picks: rows.reduce(
      (s, t) =>
        s +
        t.names
          .slice(2)
          .join(", ")
          .split(/\d{4} round \d+ pick/).length -
        1,
      0,
    ),
  };
}

export function recordTierSeason(report: SeasonReport): TierSeason {
  const { outcome, players, close } = report;
  return {
    tables: Object.fromEntries(
      Object.entries(outcome.tables).map(([id, rows]) => [id, rows.map((r) => r.cid)]),
    ),
    moves: outcome.moves,
    seniors: report.squadsAtFirstMatch,
    freeAgents: players.filter((p) => p.status === "freeAgent").length,
    trades: tradesOf(report),
    cap: {
      over: close.tax.paid.size,
      taxPaid: [...close.tax.paid.values()].reduce((a, b) => a + b, 0),
      afterGrace: close.tax.afterGrace.length,
    },
  };
}

/**
 * Seasons where the moves differ from the config: each league must send exactly its
 * relegation places down and receive the same number from below; a league without
 * relegation sends nobody down.
 */
export function moveProblems(run: TierRun, config: CompetitionsConfig): string[] {
  const problems: string[] = [];
  run.seasons.forEach((s, i) => {
    for (const league of config.leagues) {
      const down = s.moves.filter((m) => m.from === league.id && m.reason === "relegated");
      const expected = league.relegation?.places ?? 0;
      if (down.length !== expected || down.some((m) => m.to !== league.relegation?.to)) {
        problems.push(`${run.seed} season ${i + 1}: ${down.length} down from ${league.id}`);
      }
      const up = s.moves.filter((m) => m.to === league.id && m.reason !== "relegated");
      if (up.length !== expected) {
        problems.push(`${run.seed} season ${i + 1}: ${up.length} up into ${league.id}`);
      }
    }
  });
  return problems;
}

/** Promotions followed by relegation from the new tier within `within` seasons. */
export function yoYo(runs: readonly TierRun[], within = 2): { promotions: number; yoYos: number } {
  let promotions = 0;
  let yoYos = 0;
  for (const run of runs) {
    run.seasons.forEach((s, i) => {
      if (i + within >= run.seasons.length) return; // too late to know
      for (const up of s.moves.filter((m) => m.reason !== "relegated")) {
        promotions++;
        const later = run.seasons.slice(i + 1, i + 1 + within);
        if (
          later.some((t) =>
            t.moves.some((m) => m.cid === up.cid && m.from === up.to && m.reason === "relegated"),
          )
        ) {
          yoYos++;
        }
      }
    });
  }
  return { promotions, yoYos };
}

/**
 * The rise: from each finish in the bottom `fromBottom` of `bottomLeague` (a clock starts
 * when none is running for that club), the seasons until the club first finishes in the
 * top `toTop` of `topLeague`. Clocks still running when the run ends never made it.
 */
export function rise(
  runs: readonly TierRun[],
  bottomLeague: string,
  fromBottom: number,
  topLeague: string,
  toTop: number,
): { seasons: number[]; never: number } {
  const seasons: number[] = [];
  let never = 0;
  for (const run of runs) {
    const started = new Map<number, number>();
    run.seasons.forEach((s, i) => {
      for (const cid of (s.tables[topLeague] ?? []).slice(0, toTop)) {
        const from = started.get(cid);
        if (from !== undefined) {
          seasons.push(i - from);
          started.delete(cid);
        }
      }
      for (const cid of (s.tables[bottomLeague] ?? []).slice(-fromBottom)) {
        if (!started.has(cid)) started.set(cid, i);
      }
    });
    never += started.size;
  }
  return { seasons, never };
}

/**
 * Tier mobility: moves per club per season, distinct clubs that played in the top league,
 * and how many of its opening clubs are still there after `after` seasons.
 */
export function mobility(
  runs: readonly TierRun[],
  topLeague: string,
  clubs: number,
  after: readonly number[],
): { movesPerClubSeason: number; topClubs: number[]; openingStill: Record<number, number[]> } {
  let moves = 0;
  let clubSeasons = 0;
  const topClubs: number[] = [];
  const openingStill: Record<number, number[]> = Object.fromEntries(after.map((n) => [n, []]));
  for (const run of runs) {
    const seen = new Set<number>();
    for (const s of run.seasons) {
      moves += s.moves.length;
      clubSeasons += clubs;
      for (const cid of s.tables[topLeague] ?? []) seen.add(cid);
    }
    topClubs.push(seen.size);
    const opening = new Set(run.seasons[0]?.tables[topLeague] ?? []);
    for (const n of after) {
      const later = run.seasons[n - 1]?.tables[topLeague];
      if (later) openingStill[n]?.push(later.filter((cid) => opening.has(cid)).length);
    }
  }
  return { movesPerClubSeason: moves / Math.max(1, clubSeasons), topClubs, openingStill };
}

/** The largest change in active players after any season against the start, over the runs. */
export const playerCountDrift = (runs: readonly TierRun[]): number =>
  Math.max(0, ...runs.flatMap((r) => r.activeAfter.map((n) => Math.abs(n / r.activeAtStart - 1))));

/** A squad-shape measure in one season of each run, averaged over the runs. */
const shapeAt = (
  runs: readonly TierRun[],
  key: keyof SquadShape,
  season: (r: TierRun) => TierSeason | undefined,
): number =>
  runs.reduce((a, r) => a + (season(r)?.seniors[key] ?? 0), 0) / Math.max(1, runs.length);

/** A squad-shape measure in the last season, averaged over the runs. */
export const lastShape = (runs: readonly TierRun[], key: keyof SquadShape): number =>
  shapeAt(runs, key, (r) => r.seasons.at(-1));

/** A squad-shape measure's drift: the last season's value less season `from`'s (from 1). */
export const shapeDrift = (runs: readonly TierRun[], key: keyof SquadShape, from = 1): number =>
  lastShape(runs, key) - shapeAt(runs, key, (r) => r.seasons[from - 1]);

/**
 * SL5's exploit checks (MILESTONES SL5) on a world as a run left it, the board's targets set
 * for `season` (states as the AI would read them):
 * - two average players never equal a star: every star (the best 2% of seniors) against
 *   each other club's two best average players (within 2 of the mean OVR, aged 23-30, POT
 *   at most 3 above OVR); the star's club must lose talent by the trade (its squad by
 *   place, contracts and cap room aside). Also counted: how many such offers it would take
 *   with contracts and cap room counted (an overpaid veteran, a club shedding wages);
 * - a pick's value falls a draft further away, and with a stronger original owner (a later
 *   projected slot), to a contending and a rebuilding club alike.
 */
export function tradeExploits(world: LoopWorld, season: number): TradeExploits {
  const trades = world.config.competitions.trades;
  const out = {
    starsChecked: 0,
    starsEqualled: 0,
    starsBought: 0,
    picksChecked: 0,
    picksOutOfOrder: 0,
  };
  if (!trades) return out;
  const date = `${season}-07-01`;
  preseasonBoard(world, season, date, world.config.competitions);
  const tw = { ...world, draftPicks: world.draftPicks ?? [] };
  const day = tradeDay(tw, season, date);
  const seniors = world.players.filter((p) => p.status === "club" && p.cid !== null);
  const mean = seniors.reduce((a, p) => a + p.ovr, 0) / Math.max(1, seniors.length);
  const age = (p: Player) => exactAge(p.birthDate, date);
  const stars = [...seniors]
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, Math.ceil(seniors.length * 0.02));
  const average = seniors.filter(
    (p) => Math.abs(p.ovr - mean) <= 2 && age(p) >= 23 && age(p) <= 30 && p.pot - p.ovr <= 3,
  );
  for (const star of stars) {
    for (const club of world.clubs) {
      if (club.cid === star.cid) continue;
      const two = average
        .filter((p) => p.cid === club.cid)
        .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
        .slice(0, 2);
      if (two.length < 2) continue;
      out.starsChecked++;
      // Talent by squad place: the star's club's squad with him, and with the two instead.
      const owner = star.cid as number;
      const state = tradeState(tw, owner);
      const talent = (p: Player) => talentValue(trades, p, age(p), state);
      const squad = seniors.filter((p) => p.cid === owner);
      const withTwo = [...squad.filter((p) => p.pid !== star.pid), ...two];
      if (squadValue(trades, withTwo.map(talent)) >= squadValue(trades, squad.map(talent))) {
        out.starsEqualled++;
      }
      const change = valueChange(
        tw,
        day,
        star.cid as number,
        { pids: [star.pid], picks: [] },
        { pids: two.map((p) => p.pid), picks: [] },
      );
      if (change.dv >= 0) out.starsBought++;
    }
  }
  for (const state of ["contending", "rebuilding"] as const) {
    const cid = world.clubs.find((c) => tradeState(tw, c.cid) === state)?.cid;
    if (cid === undefined) continue;
    const view = clubView(tw, cid, day);
    const value = (p: DraftPick) => pickTradeValue(tw, day, view, p);
    const own = (a: DraftPick, b: DraftPick) =>
      a.round === b.round && a.originalCid === b.originalCid;
    for (const p of tw.draftPicks) {
      // The same slot a draft later is worth less...
      const later = tw.draftPicks.find((q) => own(p, q) && q.season === p.season + 1);
      if (later) {
        out.picksChecked++;
        if (!(value(later) < value(p))) out.picksOutOfOrder++;
      }
      // ...and so is a stronger original owner's (a later slot), the same draft and round.
      for (const q of tw.draftPicks) {
        if (q.season !== p.season || q.round !== p.round || p.pick !== undefined) continue;
        const [sp, sq] = [day.slots.get(p.originalCid) ?? 0, day.slots.get(q.originalCid) ?? 0];
        if (sq !== sp + 1) continue;
        out.picksChecked++;
        if (value(q) > value(p)) out.picksOutOfOrder++;
      }
    }
  }
  return out;
}

/** The picks clubs hold: the most by one club, and how many hold none. */
export function picksHeld(world: LoopWorld): { most: number; none: number } {
  const held = new Map(world.clubs.map((c) => [c.cid, 0]));
  for (const p of world.draftPicks ?? []) held.set(p.cid, (held.get(p.cid) ?? 0) + 1);
  const counts = [...held.values()];
  return { most: Math.max(0, ...counts), none: counts.filter((n) => n === 0).length };
}
