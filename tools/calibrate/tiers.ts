/**
 * Tier mobility for a world of tiers (the Super League, SPEC §17.9): per season what the
 * harness records (final tables, moves, squad sizes), and the measures over a run: the
 * acceptance (exactly the configured places up and down every season, nobody out of the
 * lowest tier), yo-yo clubs, the rise from the bottom tier to the top, tier mobility.
 */
import type { CompetitionsConfig } from "../../src/common/config/competitions";
import type { ClubMove } from "../../src/worker/season/season";
import type { SeasonReport } from "./world";

export interface TierSeason {
  /** Each league's final table, club IDs top first. */
  tables: Record<string, number[]>;
  moves: ClubMove[];
  /** Seniors per club after the season's first league matchday: fewest and most. */
  seniors: { min: number; max: number };
  freeAgents: number;
  /**
   * At the season's end (30 June): clubs over their cap (paying luxury tax), the tax they
   * paid in euros, and relegated clubs still over their own cap after their grace.
   */
  cap: { over: number; taxPaid: number; afterGrace: number };
}

/** One world's run (plain data: it crosses process boundaries as JSON). */
export interface TierRun {
  seed: string;
  seasons: TierSeason[];
  activeAtStart: number;
  activeAfter: number[];
  seconds: number;
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
