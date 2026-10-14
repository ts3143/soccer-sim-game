/**
 * Plays whole seasons headlessly and prints what happened:
 * `pnpm season [--seed X] [--seasons N]`.
 *
 * Per season: the league tables (in full for the first season, top and bottom after),
 * both cups round by round, the play-off bracket, and who went up and down. Squads are
 * each club's best XI at full condition for now; rotation, fatigue and development
 * arrive in later M3 chunks.
 */
import { competitionsConfig } from "../src/common/config/competitions";
import type { Club, Fixture } from "../src/common/schema";
import { generateWorld } from "../src/worker/generate/world";
import { PLAYOFF_ROUNDS } from "../src/worker/schedule/calendar";
import type { TableRow } from "../src/worker/schedule/standings";
import { fullStrengthPlay } from "../src/worker/season/play";
import {
  applyMoves,
  createSeason,
  finishesOf,
  type LastFinish,
  playoffId,
  playRest,
  seasonOutcome,
} from "../src/worker/season/season";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback;
};
const SEED = option("--seed", "season");
const SEASONS = Number(option("--seasons", "1"));

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const world = generateWorld({
  seed: SEED,
  name: "season",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const clubs: Club[] = world.clubs.map((c) => ({ ...c }));
const name = new Map(clubs.map((c) => [c.cid, c.name]));
const abbr = new Map(clubs.map((c) => [c.cid, c.abbr]));
const play = fullStrengthPlay(world.clubs, world.players);

function score(f: Fixture): string {
  const r = f.result;
  if (!r) return "–";
  const extra = r.penalties
    ? ` aet, ${r.penalties.replace("-", "–")} pens`
    : r.extraTime
      ? " aet"
      : "";
  return `${r.homeGoals}–${r.awayGoals}${extra}`;
}
const tie = (f: Fixture) =>
  `${name.get(f.homeCid)} ${score(f)} ${name.get(f.awayCid)}${f.neutral ? " (neutral)" : ""}`;

function printTable(rows: TableRow[], full: boolean, zones: (pos: number) => string) {
  console.log("  Pos Club                          P   W   D   L   GF  GA   GD  Pts");
  rows.forEach((r, i) => {
    if (!full && i >= 4 && i < rows.length - 4) {
      if (i === 4) console.log("  ...");
      return;
    }
    const gd = r.goalDifference > 0 ? `+${r.goalDifference}` : String(r.goalDifference);
    const cells = [r.played, r.won, r.drawn, r.lost, r.goalsFor, r.goalsAgainst];
    console.log(
      `  ${String(r.position).padStart(3)} ${(name.get(r.cid) ?? "").padEnd(28)} ${cells.map((x) => String(x).padStart(3)).join(" ")} ${gd.padStart(4)} ${String(r.points).padStart(4)}  ${zones(r.position)}`,
    );
  });
}

let lastFinish: ReadonlyMap<number, LastFinish> = new Map();
let firstFid = 1;
const started = performance.now();
const champions: string[] = [];
for (let s = 0; s < SEASONS; s++) {
  const season = competitionsConfig.firstSeason + s;
  const label = `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
  const state = createSeason({ season, seed: SEED, clubs, lastFinish, firstFid });
  playRest(state, play);
  const outcome = seasonOutcome(state);
  firstFid = state.nextFid;
  console.log(`\n===== Season ${label} =====`);

  for (const league of competitionsConfig.leagues) {
    const rows = outcome.tables[league.id] ?? [];
    const po = league.promotion?.playoffPositions ?? [];
    const zones = (pos: number) =>
      pos === 1
        ? league.promotion
          ? "champions, promoted"
          : "champions"
        : league.promotion && pos <= league.promotion.automatic
          ? "promoted"
          : po.includes(pos)
            ? "play-offs"
            : league.relegation && pos > rows.length - league.relegation.places
              ? "relegated"
              : "";
    console.log(`\n${league.name}`);
    printTable(rows, s === 0, zones);
    champions.push(`${label} ${league.id}: ${name.get(outcome.champions[league.id] ?? -1)}`);
  }

  for (const cup of competitionsConfig.cups) {
    console.log(`\n${cup.name}`);
    for (const round of cup.rounds) {
      const ties = state.fixtures.filter((f) => f.competition === cup.id && f.round === round);
      const date = ties[0] ? day(ties[0].date) : "";
      if (ties.length > 4) {
        const aet = ties.filter((f) => f.result?.extraTime).length;
        const upsets = ties.filter((f) => {
          const winner = f.result?.winnerCid;
          const loser = winner === f.homeCid ? f.awayCid : f.homeCid;
          const tier = (cid: number) =>
            competitionsConfig.leagues.find((l) => state.leagueClubs[l.id]?.includes(cid))?.tier ??
            0;
          return winner !== undefined && winner !== null && tier(winner) > tier(loser);
        }).length;
        console.log(
          `  ${round} (${date}): ${ties.length} ties, ${aet} to extra time, ${upsets} won by a lower-tier club`,
        );
      } else {
        console.log(`  ${round} (${date}):`);
        for (const f of ties) console.log(`    ${tie(f)}`);
      }
    }
    console.log(`  Winner: ${name.get(outcome.cupWinners[cup.id] ?? -1)}`);
  }

  for (const league of competitionsConfig.leagues.filter((l) => l.promotion)) {
    const id = playoffId(league.id);
    const table = outcome.tables[league.id] ?? [];
    const pos = (cid: number) => table.find((r) => r.cid === cid)?.position;
    const seeded = (cid: number) => `${name.get(cid)} (${pos(cid)})`;
    console.log(`\n${league.name} play-offs`);
    for (const f of state.fixtures.filter((x) => x.competition === id)) {
      const round = f.round + (f.leg ? `, leg ${f.leg}` : "");
      console.log(
        `  ${round.padEnd(20)} ${day(f.date).padEnd(7)} ${seeded(f.homeCid)} ${score(f)} ${seeded(f.awayCid)}${f.neutral ? " (neutral)" : ""}`,
      );
    }
    const final = state.fixtures.find(
      (f) => f.competition === id && f.round === PLAYOFF_ROUNDS.final,
    );
    console.log(`  Promoted through the play-offs: ${name.get(final?.result?.winnerCid ?? -1)}`);
  }

  console.log("\nUp and down");
  for (const m of outcome.moves) {
    console.log(`  ${(name.get(m.cid) ?? "").padEnd(28)} ${m.from} → ${m.to} (${m.reason})`);
  }
  const matches = state.fixtures.length;
  console.log(`\n${matches.toLocaleString("en-GB")} matches this season (${abbr.size} clubs).`);
  applyMoves(clubs, outcome.moves);
  lastFinish = finishesOf(outcome);
}
console.log(`\nChampions:\n  ${champions.join("\n  ")}`);
console.log(`\n${SEASONS} season(s) in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
