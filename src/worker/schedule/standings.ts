/**
 * League tables (derived on the fly from played fixtures, SPEC §12). Three points for a
 * win, one for a draw. Ties are broken by the league's own tie-breaker list (config,
 * SPEC §2.1), applied in order:
 * - plain criteria (goal difference, goals scored, …) compare the season totals;
 * - head-to-head criteria compare only the matches among the clubs still tied at that
 *   step, so a three-way tie is settled by a mini-table of those three;
 * - `draw` is a seeded random draw: stable for the same save, league and season.
 * Clubs still level after the list keep a fixed order (by club ID) so the table is
 * always deterministic.
 */
import type { TieBreaker } from "../../common/config/competitions";
import type { Fixture } from "../../common/schema";
import { Random } from "../core/random";

export interface TableRow {
  cid: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** 1-based position after the tie-breakers. */
  position: number;
}

type Totals = Omit<TableRow, "position">;

const emptyRow = (cid: number): Totals => ({
  cid,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
});

/** Totals per club from the played fixtures among `fixtures` (unplayed ones are skipped). */
function totals(cids: readonly number[], fixtures: readonly Fixture[]): Map<number, Totals> {
  const rows = new Map(cids.map((cid) => [cid, emptyRow(cid)]));
  for (const f of fixtures) {
    const home = rows.get(f.homeCid);
    const away = rows.get(f.awayCid);
    if (!f.result || !home || !away) continue;
    const { homeGoals: hg, awayGoals: ag } = f.result;
    for (const [row, gf, ga] of [
      [home, hg, ag],
      [away, ag, hg],
    ] as const) {
      row.played++;
      row.goalsFor += gf;
      row.goalsAgainst += ga;
      row.goalDifference += gf - ga;
      if (gf > ga) {
        row.won++;
        row.points += 3;
      } else if (gf === ga) {
        row.drawn++;
        row.points += 1;
      } else row.lost++;
    }
  }
  return rows;
}

const PLAIN: Partial<Record<TieBreaker, (row: Totals) => number>> = {
  points: (r) => r.points,
  goalDifference: (r) => r.goalDifference,
  goalsFor: (r) => r.goalsFor,
  goalsAgainst: (r) => -r.goalsAgainst,
  wins: (r) => r.won,
};

const HEAD_TO_HEAD: Partial<Record<TieBreaker, (row: Totals) => number>> = {
  headToHeadPoints: (r) => r.points,
  headToHeadGoalDifference: (r) => r.goalDifference,
  headToHeadGoalsFor: (r) => r.goalsFor,
};

export interface TableOptions {
  tieBreakers: readonly TieBreaker[];
  /** Seed of the `draw` tie-breaker, e.g. `${saveSeed}/table/${league}/${season}`. */
  drawSeed: string;
}

/** The league table of `cids` from `fixtures` (this league and season only). */
export function leagueTable(
  cids: readonly number[],
  fixtures: readonly Fixture[],
  options: TableOptions,
): TableRow[] {
  const rows = totals(cids, fixtures);
  const drawKeys = new Map<number, number>();
  const drawKey = (cid: number): number => {
    let key = drawKeys.get(cid);
    if (key === undefined) {
      key = Random.fromSeed(`${options.drawSeed}/${cid}`).next();
      drawKeys.set(cid, key);
    }
    return key;
  };

  const order = (group: Totals[], step: number): Totals[] => {
    if (group.length <= 1) return group;
    const criterion = options.tieBreakers[step];
    if (criterion === undefined) return [...group].sort((a, b) => a.cid - b.cid);
    let key: (row: Totals) => number;
    const plain = PLAIN[criterion];
    const h2h = HEAD_TO_HEAD[criterion];
    if (plain) key = plain;
    else if (h2h) {
      const ids = new Set(group.map((r) => r.cid));
      const mini = totals(
        [...ids],
        fixtures.filter((f) => ids.has(f.homeCid) && ids.has(f.awayCid)),
      );
      key = (row) => h2h(mini.get(row.cid) as Totals);
    } else key = (row) => drawKey(row.cid);

    const sorted = [...group].sort((a, b) => key(b) - key(a));
    const out: Totals[] = [];
    for (let i = 0; i < sorted.length;) {
      let j = i + 1;
      while (j < sorted.length && key(sorted[j] as Totals) === key(sorted[i] as Totals)) j++;
      out.push(...order(sorted.slice(i, j), step + 1));
      i = j;
    }
    return out;
  };

  return order([...rows.values()], 0).map((row, i) => ({ ...row, position: i + 1 }));
}
