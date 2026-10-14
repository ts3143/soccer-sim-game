/**
 * League fixtures: a double round-robin. The first half uses the circle method with the
 * classic home/away pattern (Berger tables), so clubs alternate home and away with few
 * breaks. The second half replays the first with venues swapped, starting from its
 * second round (first-half round 1 is replayed last). That shift means no club ever
 * plays three home or three away matches in a row, and the two meetings of any pair are
 * at least n − 2 rounds apart.
 * Clubs are shuffled onto the table's positions with the season's own random stream, so
 * every season has a different order of opponents.
 */
import type { Fixture } from "../../common/schema";
import type { Random } from "../core/random";
import type { RoundDate } from "./calendar";

/** Rounds of [home, away] index pairs for `n` clubs (n even): 2 × (n − 1) rounds. */
export function doubleRoundRobin(n: number): [number, number][][] {
  if (n < 2 || n % 2 !== 0) throw new Error(`Round-robin needs an even number of clubs, got ${n}`);
  const fixed = n - 1;
  const firstHalf: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    // The fixed club alternates home and away; in pair k the club at r + k hosts when k
    // is odd. This gives each club at most one home or away "break" per half.
    const round: [number, number][] = [r % 2 === 0 ? [r, fixed] : [fixed, r]];
    for (let k = 1; k < n / 2; k++) {
      const a = (r + k) % (n - 1);
      const b = (r - k + n - 1) % (n - 1);
      round.push(k % 2 === 1 ? [a, b] : [b, a]);
    }
    firstHalf.push(round);
  }
  const secondHalf = firstHalf.map((_, k) =>
    (firstHalf[(k + 1) % (n - 1)] as [number, number][]).map(([home, away]): [number, number] => [
      away,
      home,
    ]),
  );
  return [...firstHalf, ...secondHalf];
}

/**
 * One season of league fixtures for `cids`, dated by `dates` (one per round, in round
 * order, as the calendar gives them). `rng` should be the league-season's own stream.
 */
export function leagueFixtures(
  competition: string,
  season: number,
  cids: readonly number[],
  dates: readonly RoundDate[],
  rng: Random,
  nextFid: () => number,
): Fixture[] {
  const rounds = doubleRoundRobin(cids.length);
  if (rounds.length !== dates.length) {
    throw new Error(`${competition}: ${rounds.length} rounds but ${dates.length} dates`);
  }
  const order = rng.shuffle(cids);
  return rounds.flatMap((pairs, r) => {
    const { date, slot, round } = dates[r] as RoundDate;
    return pairs.map(([home, away]): Fixture => ({
      fid: nextFid(),
      season,
      date,
      slot,
      competition,
      round,
      homeCid: order[home] as number,
      awayCid: order[away] as number,
      result: null,
    }));
  });
}
