/**
 * Plays whole seasons headlessly and prints what happened:
 * `pnpm season [--seed X] [--seasons N]`.
 *
 * Per season: the league tables (in full for the first season, top and bottom after),
 * both cups round by round, the play-off bracket, and who went up and down, then the
 * squad numbers: top clubs' minutes share, injuries, parity. Clubs pick their matchday
 * squads with the rotation AI, with condition and injuries carried between matches.
 * `--quiet` prints only the numbers. Development arrives in a later M3 chunk.
 */
import { competitionsConfig } from "../src/common/config/competitions";
import type { Club, Fixture } from "../src/common/schema";
import { generateWorld } from "../src/worker/generate/world";
import { PLAYOFF_ROUNDS } from "../src/worker/schedule/calendar";
import type { TableRow } from "../src/worker/schedule/standings";
import { isInjured, squadPlay } from "../src/worker/season/squads";
import {
  applyMoves,
  createSeason,
  finishesOf,
  type LastFinish,
  nextMatchDate,
  playDate,
  playoffId,
  seasonOutcome,
} from "../src/worker/season/season";

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

const world = generateWorld({
  seed: SEED,
  name: "season",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const clubs: Club[] = world.clubs.map((c) => ({ ...c }));
const name = new Map(clubs.map((c) => [c.cid, c.name]));
const abbr = new Map(clubs.map((c) => [c.cid, c.abbr]));
const players = structuredClone(world.players);

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
const allMetrics: Record<string, number>[] = [];
let firstFid = 1;
const started = performance.now();
const champions: string[] = [];
for (let s = 0; s < SEASONS; s++) {
  const season = competitionsConfig.firstSeason + s;
  const label = `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
  const state = createSeason({ season, seed: SEED, clubs, lastFinish, firstFid });
  for (const p of players) {
    p.condition = 100;
    p.conditionDate = null;
  }
  const squads = squadPlay(state, clubs, players);
  // Minutes per club per player, and the minutes each club had to give (11 × match length).
  const minutes = new Map<number, Map<number, number>>();
  const available = new Map<number, number>();
  const play: typeof squads.play = (fixture, setup) => {
    const result = squads.play(fixture, setup);
    const length = result.extraTime ? 120 : 90;
    for (const cid of [fixture.homeCid, fixture.awayCid]) {
      available.set(cid, (available.get(cid) ?? 0) + 11 * length);
    }
    for (const p of result.players) {
      const cid = p.side === 0 ? fixture.homeCid : fixture.awayCid;
      const club = minutes.get(cid) ?? new Map<number, number>();
      club.set(p.pid, (club.get(p.pid) ?? 0) + p.minutes);
      minutes.set(cid, club);
    }
    const g = goalsBy.get(fixture.competition) ?? new Map<number, [number, number]>();
    goalsBy.set(fixture.competition, g);
    for (const p of result.players) {
      const [goals, assists] = g.get(p.pid) ?? [0, 0];
      g.set(p.pid, [goals + p.goals, assists + p.assists]);
    }
    return result;
  };
  const goalsBy = new Map<string, Map<number, [number, number]>>();
  let injuredSamples = 0;
  let injuredTotal = 0;
  let previous = `${season}-07-01`;
  for (let date = nextMatchDate(state); date !== null; date = nextMatchDate(state)) {
    squads.train(previous, date);
    previous = date;
    playDate(state, date, play);
    for (const club of clubs) {
      injuredTotal += players.filter(
        (p) => p.cid === club.cid && p.status === "club" && isInjured(p, date),
      ).length;
      injuredSamples++;
    }
  }
  const outcome = seasonOutcome(state);
  firstFid = state.nextFid;
  log(`\n===== Season ${label} =====`);

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
    log(`\n${league.name}`);
    printTable(rows, s === 0, zones);
    champions.push(`${label} ${league.id}: ${name.get(outcome.champions[league.id] ?? -1)}`);
  }

  for (const cup of competitionsConfig.cups) {
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
            competitionsConfig.leagues.find((l) => state.leagueClubs[l.id]?.includes(cid))?.tier ??
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

  for (const league of competitionsConfig.leagues.filter((l) => l.promotion)) {
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
  const matches = state.fixtures.length;
  log(`\n${matches.toLocaleString("en-GB")} matches this season (${abbr.size} clubs).`);
  // Squad numbers (calibration targets: data/config/calibration_targets.json, perSeason).
  const topClubs = ["ENG1", "GER1"].flatMap((id) =>
    clubs
      .filter((c) => c.leagueId === id)
      .sort((a, b) => b.strengthTarget - a.strengthTarget)
      .slice(0, 4),
  );
  const shares = topClubs.map((club) => {
    const used = [...(minutes.get(club.cid) ?? new Map<number, number>()).values()]
      .sort((a, b) => b - a)
      .slice(0, 11)
      .reduce((sum, m) => sum + m, 0);
    return used / (available.get(club.cid) ?? 1);
  });
  const parity = (leagueId: string) => {
    const table = outcome.tables[leagueId] ?? [];
    const top = new Set(table.slice(0, 6).map((r) => r.cid));
    const bottom = new Set(table.slice(-6).map((r) => r.cid));
    let meetings = 0;
    let upsets = 0;
    for (const f of state.fixtures.filter((x) => x.competition === leagueId)) {
      const r = f.result;
      if (!r) continue;
      if (top.has(f.homeCid) && bottom.has(f.awayCid)) {
        meetings++;
        if (r.homeGoals < r.awayGoals) upsets++;
      } else if (top.has(f.awayCid) && bottom.has(f.homeCid)) {
        meetings++;
        if (r.awayGoals < r.homeGoals) upsets++;
      }
    }
    return upsets / Math.max(1, meetings);
  };
  const lengths = squads.injuries;
  const share = (test: (d: number) => boolean) =>
    lengths.filter(test).length / Math.max(1, lengths.length);
  const eng1 = outcome.tables.ENG1 ?? [];
  const eng1Scorers = [...(goalsBy.get("ENG1") ?? new Map<number, [number, number]>()).values()];
  const metrics = {
    topClubStarterMinutesShare: shares.reduce((a, b) => a + b, 0) / shares.length,
    injuredPerSquadAtOnce: injuredTotal / Math.max(1, injuredSamples),
    injuriesPerTeamMatch: (lengths.length - squads.trainingCount()) / (2 * state.fixtures.length),
    trainingInjuryShare: squads.trainingCount() / Math.max(1, lengths.length),
    injuryUnderOneWeek: share((d) => d < 7),
    injuryOneToThreeWeeks: share((d) => d >= 7 && d <= 21),
    injuryFourWeeksPlus: share((d) => d >= 28),
    injurySeasonEnding: share((d) => d >= 120),
    parityENG1: parity("ENG1"),
    parityENG2: parity("ENG2"),
    parityGER1: parity("GER1"),
    championPointsENG1: eng1[0]?.points ?? 0,
    bottomPointsENG1: eng1.at(-1)?.points ?? 0,
    topScorerENG1: Math.max(...eng1Scorers.map(([g]) => g)),
    topAssistsENG1: Math.max(...eng1Scorers.map(([, a]) => a)),
  };
  allMetrics.push(metrics);
  log("\nSquad numbers");
  for (const [k, v] of Object.entries(metrics))
    log(`  ${k.padEnd(28)} ${v < 1 ? v.toFixed(3) : v.toFixed(1)}`);
  applyMoves(clubs, outcome.moves);
  lastFinish = finishesOf(outcome);
}
if (SEASONS > 1 || QUIET) {
  console.log(`\nAverage over ${SEASONS} season(s)`);
  for (const key of Object.keys(allMetrics[0] ?? {})) {
    const v = allMetrics.reduce((sum, m) => sum + (m[key] ?? 0), 0) / allMetrics.length;
    console.log(`  ${key.padEnd(28)} ${v < 1 ? v.toFixed(3) : v.toFixed(1)}`);
  }
}
console.log(`\nChampions:\n  ${champions.join("\n  ")}`);
console.log(`\n${SEASONS} season(s) in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
