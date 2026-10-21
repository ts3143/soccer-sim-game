// M7 performance pass (SPEC §14): ten seasons through the Play menu. Each season is timed
// (the budget: under 60 s on a mid-range laptop, taken as a machine 4x slower than this one,
// T 2026-10-20), the save's size is measured after each (under 100 MB after ten), retention
// and pruning are checked against SPEC §12, and the heaviest pages are timed at the end.
//
// Chrome's CPU throttling doesn't reach the game's worker (measured: a season takes the same
// time at 1x and 4x), so the 4x figure is each season's measured time multiplied by 4.
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-perf-"));
const SEASONS = 10;
const SLOWDOWN = 4;
const SEASON_BUDGET_MS = 60_000;
const SAVE_BUDGET_MB = 100;
const PAGE_BUDGET_MS = 1_000;
let failures = 0;
const errors = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const testId = (id) => page.locator(`[data-testid="${id}"]`);
const idle = () =>
  page.waitForFunction(
    () => !/Playing/.test(document.querySelector('[data-testid="play-button"]')?.textContent ?? ""),
    null,
    { timeout: 600_000 },
  );
const userClubs = [];
async function takeJobIfSacked() {
  if ((await testId("fired-banner").count()) === 0) return;
  await page.goto(page.url().replace(/(\/l\/\d+).*/, "$1/fired"));
  await testId("job-offers").waitFor({ timeout: 30_000 });
  const club = await testId("job-offers").locator("h3").first().innerText();
  await testId("job-offers").getByRole("button", { name: "Take the job" }).first().click();
  await testId("club-summary").waitFor({ timeout: 30_000 });
  userClubs.push(club);
  console.log(`      sacked: took the job at ${club}`);
}
/** Runs one Play option and returns how long it took (ms). */
async function play(label) {
  await testId("play-button").click();
  const item = testId("play-menu").getByRole("button", { name: label, exact: true });
  if ((await item.count()) === 0) {
    await testId("play-button").click();
    return 0;
  }
  const started = Date.now();
  await item.click();
  await page.waitForTimeout(50);
  await idle();
  const ms = Date.now() - started;
  await takeJobIfSacked();
  return ms;
}

/** What the save holds (read straight from IndexedDB; the game itself only does this in its worker). */
const saveStats = (lid, clubs) =>
  page.evaluate(
    async ({ lid, clubs }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(`league-${lid}`);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const all = (store) =>
        new Promise((resolve, reject) => {
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const [meta, players, matches, stats, awards, transactions, fixtures, clubsRows] =
        await Promise.all(
          [
            "meta",
            "players",
            "matches",
            "playerStats",
            "awards",
            "transactions",
            "fixtures",
            "clubs",
          ].map(all),
        );
      db.close();
      const game = meta.find((m) => m.userCid !== undefined && m.season !== undefined) ?? {};
      const season = game.season;
      const mine = new Set(clubsRows.filter((c) => clubs.includes(c.name)).map((c) => c.cid));
      mine.add(game.userCid);
      const awarded = new Set(awards.map((a) => a.pid));
      const appsForUser = new Map();
      for (const r of stats) {
        if (mine.has(r.cid)) appsForUser.set(r.pid, (appsForUser.get(r.pid) ?? 0) + r.appearances);
      }
      const pids = new Set(players.map((p) => p.pid));
      const prunable = players.filter(
        (p) =>
          p.status === "retired" &&
          p.retiredSeason !== null &&
          p.retiredSeason <= season - 3 &&
          Math.max(...p.ratingsHistory.map((r) => r.ovr)) < 74 &&
          !awarded.has(p.pid) &&
          (appsForUser.get(p.pid) ?? 0) < 50,
      ).length;
      const estimate = await navigator.storage.estimate();
      return {
        season,
        bytes: estimate.usage ?? 0,
        players: players.length,
        retired: players.filter((p) => p.status === "retired").length,
        matches: matches.length,
        oldForeignMatches: matches.filter(
          (m) => m.season <= season - 2 && !mine.has(m.homeCid) && !mine.has(m.awayCid),
        ).length,
        oldUserMatches: matches.filter(
          (m) => m.season <= season - 2 && (mine.has(m.homeCid) || mine.has(m.awayCid)),
        ).length,
        stats: stats.length,
        orphanStats: stats.filter((r) => !pids.has(r.pid)).length,
        prunable,
        awards: awards.length,
        transactions: transactions.length,
        fixtures: fixtures.length,
      };
    },
    { lid, clubs },
  );

// --- A new league, then ten seasons ------------------------------------------------------------------
await page.goto(`${BASE}/new`);
await testId("club-choices").locator("button").first().click();
const club = (await testId("start-league").innerText()).replace(/^Start as /, "");
userClubs.push(club);
await page.fill("#new-league-name", "Perf");
await page.fill("#new-league-seed", "perf");
await testId("start-league").click();
await testId("top-bar").waitFor({ timeout: 60_000 });
const lid = Number(page.url().match(/\/l\/(\d+)/)?.[1]);

const rows = [];
for (let season = 1; season <= SEASONS; season++) {
  const matches = await play("Until the end of the season");
  const moves = await play("Proceed to promotion and relegation");
  const rollover = await play("Advance to preseason");
  const stats = await saveStats(lid, userClubs);
  const total = matches + moves + rollover;
  rows.push({ ...stats, n: season, total, matches, moves, rollover });
  console.log(
    `      season ${season}: ${(total / 1000).toFixed(1)} s (×${SLOWDOWN} ≈ ${((total * SLOWDOWN) / 1000).toFixed(1)} s) · save ${(stats.bytes / 1e6).toFixed(1)} MB · players ${stats.players} (${stats.retired} retired) · matches ${stats.matches} · stat rows ${stats.stats} · transactions ${stats.transactions}`,
  );
}

const worst = rows.reduce((a, b) => (b.total > a.total ? b : a));
check(
  `every season, from preseason to the next, fits ${SEASON_BUDGET_MS / 1000} s on a machine ${SLOWDOWN}× slower`,
  rows.every((r) => r.total * SLOWDOWN < SEASON_BUDGET_MS),
  `worst: season ${worst.n}, ${(worst.total / 1000).toFixed(1)} s here, ≈ ${((worst.total * SLOWDOWN) / 1000).toFixed(1)} s ×${SLOWDOWN}`,
);
const first = rows[0];
const last = rows.at(-1);
check(
  "seasons don't get much slower as the save grows (last within 2× of the first)",
  last.total <= 2 * first.total,
  `${(first.total / 1000).toFixed(1)} s → ${(last.total / 1000).toFixed(1)} s`,
);
check(
  `the save stays under ${SAVE_BUDGET_MB} MB after ${SEASONS} seasons`,
  last.bytes < SAVE_BUDGET_MB * 1e6,
  `${(last.bytes / 1e6).toFixed(1)} MB`,
);
check(
  "full match records: other clubs' kept 2 seasons, the user's kept",
  last.oldForeignMatches === 0 && last.oldUserMatches > 0,
  `${last.oldUserMatches} old user matches kept, ${last.oldForeignMatches} others left`,
);
check(
  "long-retired players nobody will look up are pruned, with their stat rows",
  last.prunable === 0 && last.orphanStats === 0 && last.retired > 0,
  `${last.retired} retired kept, ${last.prunable} prunable left, ${last.orphanStats} orphan stat rows`,
);
check(
  "the player count stays steady (pruning keeps up)",
  last.players < 1.6 * first.players,
  `${first.players} → ${last.players}`,
);

// --- The heaviest pages with ten seasons of history --------------------------------------------------
const timed = async (label, path, ready) => {
  const started = Date.now();
  await page.goto(`${BASE}/l/${lid}/${path}`);
  await page.waitForFunction(ready, null, { timeout: 60_000 });
  return { label, ms: Date.now() - started };
};
const pastSeason = (rows.at(-1)?.season ?? 2036) - 1;
const loads = [];
loads.push(
  await timed(
    "History",
    "history",
    () => document.querySelectorAll('[data-testid="history-season"]').length >= 10,
  ),
);
loads.push(
  await timed(
    "Team History",
    "team-history",
    () => document.querySelectorAll('[data-testid="team-seasons"] tbody tr').length >= 10,
  ),
);
loads.push(
  await timed(
    `Transactions ${pastSeason}`,
    `transactions/${pastSeason}`,
    () => document.querySelectorAll('[data-testid="transactions"] tbody tr').length > 10,
  ),
);
loads.push(
  await timed(
    `Player Stats ${pastSeason}`,
    `player-stats/${pastSeason}`,
    () => document.querySelectorAll('[data-testid="player-stats"] tbody tr').length > 10,
  ),
);
loads.push(
  await timed(
    `League Leaders ${pastSeason}`,
    `league-leaders/ENG1/${pastSeason}`,
    () => document.querySelectorAll('[data-testid="leaders-goals"] tbody tr').length > 0,
  ),
);
loads.push(
  await timed(
    `Finances ${pastSeason}`,
    `finances/${pastSeason}`,
    () => document.querySelectorAll('[data-testid="finances"] tbody tr').length > 10,
  ),
);
loads.push(
  await timed(
    "Player Ratings",
    "player-ratings",
    () => document.querySelectorAll('[data-testid="player-ratings"] tbody tr').length > 10,
  ),
);
// A player with a long career: the first name in History's Player of the Year column.
await page.goto(`${BASE}/l/${lid}/history`);
await testId("history-season").last().waitFor({ timeout: 30_000 });
const veteran = await testId("history-season")
  .last()
  .locator("tbody tr")
  .first()
  .locator("td")
  .nth(4)
  .locator("a")
  .getAttribute("href");
if (veteran) {
  loads.push(
    await timed(
      "an old award winner's profile",
      veteran.replace(/^\/l\/\d+\//, ""),
      () => document.querySelector('[data-testid="career"]') !== null,
    ),
  );
}
const slowest = loads.reduce((a, b) => (b.ms > a.ms ? b : a));
for (const l of loads) console.log(`      ${l.label}: ${l.ms} ms`);
check(
  `the heaviest pages load within ${PAGE_BUDGET_MS} ms after ${SEASONS} seasons`,
  loads.every((l) => l.ms < PAGE_BUDGET_MS),
  `slowest: ${slowest.label} ${slowest.ms} ms`,
);

const text = await page.locator("body").innerText();
const leaked = expected.realNames.filter((n) => text.includes(n));
check("no real club names", leaked.length === 0, leaked.join(", "));
check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nThe performance pass passes." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
