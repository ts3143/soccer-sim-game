/**
 * Prints a season's match calendar: `pnpm calendar [--season 2026]`.
 *
 * Per league: first and last round, midweek rounds, weekends left free, play-off dates.
 * Per cup: the date of each round. To play a season, use `pnpm season`.
 */
import { competitionsConfig } from "../src/common/config/competitions";
import { seasonCalendar } from "../src/worker/schedule/calendar";

const args = process.argv.slice(2);
const i = args.indexOf("--season");
const SEASON = i >= 0 ? Number(args[i + 1]) : competitionsConfig.firstSeason;

export const day = (iso: string) =>
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
  for (const r of cal.playoffs[league.id] ?? []) {
    console.log(`  play-offs: ${r.round}${r.leg ? ` (leg ${r.leg})` : ""} ${day(r.date)}`);
  }
}
console.log("");
for (const cup of competitionsConfig.cups) {
  console.log(`${cup.id} ${cup.name}:`);
  for (const r of cal.cups[cup.id] ?? []) console.log(`  ${r.round.padEnd(26)} ${day(r.date)}`);
}
