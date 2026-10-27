/**
 * Plays whole seasons headlessly and prints what happened:
 * `pnpm season [--seed X] [--seasons N]`.
 *
 * Per season: the league tables (in full for the first season, top and bottom after),
 * both cups round by round, the play-off bracket, and who went up and down, then the
 * squad numbers: top clubs' minutes share, injuries, parity. Clubs pick their matchday
 * squads with the rotation AI, with condition and injuries carried between matches, and
 * players develop, retire and come through the academies between seasons (the same code
 * as a save, src/worker/season). `--quiet` prints only the numbers.
 */
import { worlds } from "../src/common/config/worlds";
import type { Fixture } from "../src/common/schema";
import { PLAYOFF_ROUNDS } from "../src/worker/schedule/calendar";
import type { TableRow } from "../src/worker/schedule/standings";
import { playoffId } from "../src/worker/season/season";
import { simulateWorld } from "./calibrate/world";

const config = worlds.classic;
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback;
};
const SEED = option("--seed", "season");
const SEASONS = Number(option("--seasons", "1"));
const QUIET = args.includes("--quiet");
const log = (...text: unknown[]) => {
  if (!QUIET) console.log(...text);
};

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const name = new Map<number, string>();

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

const started = performance.now();
const champions: string[] = [];
const run = simulateWorld(config, SEED, SEASONS, ({ index, state, outcome, metrics, clubs }) => {
  const season = state.season;
  const label = `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
  for (const c of clubs) name.set(c.cid, c.name);
  log(`\n===== Season ${label} =====`);

  for (const league of config.competitions.leagues) {
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
    log(`\n${league.name}`);
    if (!QUIET) printTable(rows, index === 0, zones);
    champions.push(`${label} ${league.id}: ${name.get(outcome.champions[league.id] ?? -1)}`);
  }

  for (const cup of config.competitions.cups) {
    log(`\n${cup.name}`);
    for (const round of cup.rounds) {
      const ties = state.fixtures.filter((f) => f.competition === cup.id && f.round === round);
      const date = ties[0] ? day(ties[0].date) : "";
      if (ties.length > 4) {
        const aet = ties.filter((f) => f.result?.extraTime).length;
        const upsets = ties.filter((f) => {
          const winner = f.result?.winnerCid;
          const loser = winner === f.homeCid ? f.awayCid : f.homeCid;
          const tier = (cid: number) =>
            config.competitions.leagues.find((l) => state.leagueClubs[l.id]?.includes(cid))?.tier ??
            0;
          return winner !== undefined && winner !== null && tier(winner) > tier(loser);
        }).length;
        log(
          `  ${round} (${date}): ${ties.length} ties, ${aet} to extra time, ${upsets} won by a lower-tier club`,
        );
      } else {
        log(`  ${round} (${date}):`);
        for (const f of ties) log(`    ${tie(f)}`);
      }
    }
    log(`  Winner: ${name.get(outcome.cupWinners[cup.id] ?? -1)}`);
  }

  for (const league of config.competitions.leagues.filter((l) => l.promotion)) {
    const id = playoffId(league.id);
    const table = outcome.tables[league.id] ?? [];
    const pos = (cid: number) => table.find((r) => r.cid === cid)?.position;
    const seeded = (cid: number) => `${name.get(cid)} (${pos(cid)})`;
    log(`\n${league.name} play-offs`);
    for (const f of state.fixtures.filter((x) => x.competition === id)) {
      const round = f.round + (f.leg ? `, leg ${f.leg}` : "");
      log(
        `  ${round.padEnd(20)} ${day(f.date).padEnd(7)} ${seeded(f.homeCid)} ${score(f)} ${seeded(f.awayCid)}${f.neutral ? " (neutral)" : ""}`,
      );
    }
    const final = state.fixtures.find(
      (f) => f.competition === id && f.round === PLAYOFF_ROUNDS.final,
    );
    log(`  Promoted through the play-offs: ${name.get(final?.result?.winnerCid ?? -1)}`);
  }

  log("\nUp and down");
  for (const m of outcome.moves) {
    log(`  ${(name.get(m.cid) ?? "").padEnd(28)} ${m.from} → ${m.to} (${m.reason})`);
  }
  log(`\n${state.fixtures.length.toLocaleString("en-GB")} matches this season.`);
  log("\nSeason numbers");
  for (const [k, v] of Object.entries(metrics))
    log(`  ${k.padEnd(32)} ${v < 1 ? v.toFixed(3) : v.toFixed(1)}`);
});

if (SEASONS > 1 || QUIET) {
  console.log(`\nAverage over ${SEASONS} season(s)`);
  for (const key of Object.keys(run.seasons[0] ?? {})) {
    const v = run.seasons.reduce((sum, m) => sum + (m[key] ?? 0), 0) / run.seasons.length;
    console.log(`  ${key.padEnd(32)} ${v < 1 ? v.toFixed(3) : v.toFixed(1)}`);
  }
  console.log(
    `  ${"activePlayers (start → end)".padEnd(32)} ${run.activeAtStart} → ${run.activeAfter.at(-1)}`,
  );
}
console.log(`\nChampions:\n  ${champions.join("\n  ")}`);
console.log(`\n${SEASONS} season(s) in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
