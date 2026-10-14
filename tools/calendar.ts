/**
 * Prints a season's match calendar: `pnpm calendar [--season 2026] [--sim] [--seed X]`.
 *
 * Per league: first and last round, midweek rounds, weekends left free. Per cup: the
 * date of each round. With --sim, generates a world and plays every league fixture in
 * date order (best XIs at full condition, as the M2 harness: rotation and fatigue arrive
 * later in M3), then prints the final tables with the league's tie-breakers.
 */
import { competitionsConfig } from "../src/common/config/competitions";
import type { Fixture } from "../src/common/schema";
import { Random } from "../src/worker/core/random";
import { generateWorld } from "../src/worker/generate/world";
import { seasonCalendar } from "../src/worker/schedule/calendar";
import { leagueFixtures } from "../src/worker/schedule/fixtures";
import { leagueTable } from "../src/worker/schedule/standings";
import { League } from "./calibrate/runs";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback;
};
const SEASON = Number(option("--season", String(competitionsConfig.firstSeason)));
const SEED = option("--seed", "calendar");
const SIM = args.includes("--sim");

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const list = (dates: string[]) => (dates.length ? dates.map(day).join(", ") : "none");

const cal = seasonCalendar(SEASON);
console.log(`Season ${SEASON}/${String((SEASON + 1) % 100).padStart(2, "0")} calendar\n`);
for (const league of competitionsConfig.leagues) {
  const rounds = cal.leagues[league.id] ?? [];
  const midweek = rounds.filter((r) => r.slot === "midweek").map((r) => r.date);
  const breakDates = competitionsConfig.countries.find((c) => c.id === league.country)?.winterBreak;
  console.log(
    `${league.id} ${league.name}: ${rounds.length} rounds, ${day(rounds[0]?.date ?? "")} – ${day(rounds.at(-1)?.date ?? "")}`,
  );
  console.log(
    `  weekend rounds ${rounds.length - midweek.length}, midweek rounds ${midweek.length}: ${list(midweek)}`,
  );
  console.log(`  weekends with no round: ${list(cal.spareWeekends[league.id] ?? [])}`);
  if (breakDates) console.log(`  winter break ${breakDates.from} to ${breakDates.to}: no matches`);
}
console.log("");
for (const cup of competitionsConfig.cups) {
  console.log(`${cup.id} ${cup.name}:`);
  for (const r of cal.cups[cup.id] ?? []) console.log(`  ${r.round.padEnd(26)} ${day(r.date)}`);
}

if (SIM) {
  const started = performance.now();
  const world = generateWorld({
    seed: SEED,
    name: "calendar",
    userCid: 0,
    createdAt: `${SEASON}-07-01T00:00:00.000Z`,
  });
  const league = new League(world);
  let fid = 1;
  for (const config of competitionsConfig.leagues) {
    const clubs = league.clubsByLeague.get(config.id) ?? [];
    const fixtures: Fixture[] = leagueFixtures(
      config.id,
      SEASON,
      clubs.map((c) => c.cid),
      cal.leagues[config.id] ?? [],
      Random.fromSeed(`${SEED}/fixtures/${config.id}/${SEASON}`),
      () => fid++,
    );
    for (const f of fixtures) {
      const { result } = league.play(
        config.id,
        f.homeCid,
        f.awayCid,
        `${SEED}/match:${f.fid}`,
        config.styleModifiers,
      );
      f.result = {
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        extraTime: false,
        penalties: null,
      };
    }
    const table = leagueTable(
      clubs.map((c) => c.cid),
      fixtures,
      { tieBreakers: config.tieBreakers, drawSeed: `${SEED}/table/${config.id}/${SEASON}` },
    );
    const name = new Map(clubs.map((c) => [c.cid, c.name]));
    console.log(`\n${config.name} (tie-breakers: ${config.tieBreakers.join(" → ")})`);
    console.log("  Pos Club                          P   W   D   L   GF  GA   GD  Pts");
    for (const r of table) {
      const gd = r.goalDifference > 0 ? `+${r.goalDifference}` : String(r.goalDifference);
      console.log(
        `  ${String(r.position).padStart(3)} ${(name.get(r.cid) ?? "").padEnd(28)} ${[r.played, r.won, r.drawn, r.lost, r.goalsFor, r.goalsAgainst].map((x) => String(x).padStart(3)).join(" ")} ${gd.padStart(4)} ${String(r.points).padStart(4)}`,
      );
    }
    const level = table.filter(
      (r, i) => table[i + 1]?.points === r.points || table[i - 1]?.points === r.points,
    );
    console.log(
      `  ${level.length} clubs finished level on points with a neighbour; tie-breakers decided their order.`,
    );
  }
  console.log(
    `\nSimulated in ${((performance.now() - started) / 1000).toFixed(1)} s (world generation included).`,
  );
}
