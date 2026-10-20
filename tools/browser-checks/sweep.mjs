// M5 acceptance (docs/MILESTONES.md): a full season played start to finish with only the Play
// menu, and every page opened at six points of it (preseason, after the summer window, the
// winter window, the end of the season, after promotion and relegation, the next preseason).
// Each page must render its data without errors and never show a real club name. A few
// figures are cross-checked between pages, and the big tables are timed.
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-sweep-"));
const SLOW_MS = 3000;
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const STAGES = [
  "preseason",
  "summer window closed",
  "winter window",
  "end of season",
  "promotion and relegation",
  "next preseason",
];
const ALL = [0, 1, 2, 3, 4, 5];
const PLAYED = [1, 2, 3, 4];
// What each sidebar page must show, and at which stages (an empty state is fine elsewhere).
// `rows` counts data rows of a table (an "empty" row has a single cell).
const PROBES = {
  dashboard: { sel: '[data-testid="club-summary"]', min: 1, at: ALL },
  inbox: { sel: '[data-testid="inbox-list"] button', min: 1, at: [1, 2, 3, 4, 5] },
  standings: { rows: "standings-table", min: 18, at: ALL },
  cups: { sel: '[data-testid="cup-tie"]', min: 1, at: [2, 3, 4] },
  schedule: { sel: '[data-testid="schedule-day"]', min: 1, at: [0, 1, 2, 5] },
  "power-rankings": { rows: "power-rankings", min: 18, at: ALL },
  finances: { rows: "finances", min: 62, at: ALL },
  history: { sel: '[data-testid="history-season"]', min: 1, at: [4, 5] },
  transactions: { rows: "transactions", min: 1, at: PLAYED },
  squad: { rows: "squad-table", min: 18, at: ALL },
  tactics: { rows: "tactics-xi", min: 11, at: ALL },
  "free-agents": { rows: "free-agents", min: 1, at: ALL },
  "transfer-market": { rows: "market-search", min: 1, at: ALL },
  academy: { rows: "academy", min: 1, at: ALL },
  "club-finances": { sel: '[data-testid="dials"]', min: 1, at: ALL },
  settings: { sel: '[data-testid="settings"]', min: 1, at: ALL },
  "game-log": { rows: "game-log", min: 38, at: ALL },
  "team-history": { rows: "team-seasons", min: 1, at: ALL },
  "league-leaders": { rows: "leaders-goals", min: 10, at: PLAYED },
  "player-ratings": { rows: "player-ratings", min: 50, at: ALL },
  "player-stats": { rows: "player-stats", min: 50, at: PLAYED },
  "team-stats": { rows: "team-stats", min: 18, at: PLAYED },
  injuries: { rows: "injuries", min: 1, at: [1, 2] },
};

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
let errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const main = page.locator("main");
const leaks = async () => {
  const text = await page.locator("body").innerText();
  return expected.realNames.filter((n) => text.includes(n));
};
const count = (probe) =>
  page.evaluate(
    ({ sel, rows }) =>
      rows
        ? [...document.querySelectorAll(`[data-testid="${rows}"] tbody tr`)].filter(
            (tr) => tr.children.length > 1,
          ).length
        : document.querySelectorAll(sel).length,
    probe,
  );
const settled = () =>
  page.waitForFunction(
    () => {
      const m = document.querySelector("main");
      return m !== null && !m.innerText.includes("Loading…");
    },
    null,
    { timeout: 30_000 },
  );
/** The cells of a table's row, keyed by column heading. */
const rowCells = (testId, rowText) =>
  page.evaluate(
    ({ testId, rowText }) => {
      const table = document.querySelector(
        `[data-testid="${testId}"] table, table[data-testid="${testId}"]`,
      );
      if (!table) return null;
      const heads = [...table.querySelectorAll("thead th")].map((th) =>
        th.textContent.replace(/ [▾▴]$/, "").trim(),
      );
      const row = [...table.querySelectorAll("tbody tr")].find((tr) =>
        [...tr.children].some((td) => td.textContent.trim() === rowText),
      );
      if (!row) return null;
      return Object.fromEntries(
        [...row.children].map((td, i) => [heads[i], td.textContent.trim()]),
      );
    },
    { testId, rowText },
  );
const play = async (label, until) => {
  await page.locator('[data-testid="play-button"]').click();
  await page.locator('[data-testid="play-menu"]').getByRole("button", { name: label }).click();
  await page.waitForFunction(until, null, { timeout: 300_000 });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="play-button"]')?.disabled,
    null,
    { timeout: 300_000 },
  );
};
const bar = () => document.querySelector('[data-testid="top-bar"]')?.textContent ?? "";

// --- A new league as a top-flight club --------------------------------------------------------
await page.goto(BASE);
await page.locator('[data-testid="no-leagues"]').waitFor({ timeout: 30_000 });
await page.getByRole("link", { name: "Start a new league" }).click();
await page.locator('[data-testid="club-choices"] button').first().click();
const club = (await page.locator('[data-testid="start-league"]').innerText()).replace(
  /^Start as /,
  "",
);
await page.fill("#new-league-name", "Sweep");
await page.fill("#new-league-seed", "sweep");
await page.locator('[data-testid="start-league"]').click();
await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60_000 });
const lid = page.url().match(/\/l\/(\d+)/)?.[1];
check("a new league starts", lid !== undefined, club);

const timings = [];
async function sweep(stage) {
  console.log(
    `\n--- ${STAGES[stage]}: ${(await page.locator('[data-testid="game-date"]').innerText()).replace(/\n/g, " ")}`,
  );
  errors = [];
  const links = await page
    .locator('[data-testid="sidebar"] a[href^="/l/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const keys = links.map((href) => href.split("/")[3] ?? "dashboard");
  const unprobed = keys.filter((k) => !(k in PROBES));
  const missing = Object.keys(PROBES).filter((k) => !keys.includes(k));
  check(
    `${STAGES[stage]}: every sidebar page is swept`,
    unprobed.length + missing.length === 0,
    [...unprobed, ...missing].join(", "),
  );
  const problems = [];
  for (const [i, key] of keys.entries()) {
    const probe = PROBES[key];
    if (!probe) continue;
    const started = Date.now();
    await page.locator(`[data-testid="sidebar"] a[href="${links[i]}"]`).click();
    await page.waitForFunction(
      (href) => location.pathname === href || location.pathname.startsWith(`${href}/`),
      links[i],
      { timeout: 15_000 },
    );
    await settled();
    const want = probe.at.includes(stage) ? probe.min : 0;
    if (want > 0) {
      await page
        .waitForFunction(
          ({ sel, rows, want }) =>
            (rows
              ? [...document.querySelectorAll(`[data-testid="${rows}"] tbody tr`)].filter(
                  (tr) => tr.children.length > 1,
                ).length
              : document.querySelectorAll(sel).length) >= want,
          { ...probe, want },
          { timeout: 30_000 },
        )
        .catch(() => {});
    }
    const ms = Date.now() - started;
    timings.push({ stage, key, ms });
    const found = await count(probe);
    const header = await page.locator('[data-testid="page-header"]').count();
    const alert = await main.locator(".alert-danger").count();
    const placeholder = await main.locator('[data-testid="placeholder"]').count();
    const leaked = await leaks();
    if (found < want) problems.push(`${key}: ${found} of ${want} rows`);
    if (header === 0 && key !== "dashboard") problems.push(`${key}: no page header`);
    if (alert > 0)
      problems.push(`${key}: ${await main.locator(".alert-danger").first().innerText()}`);
    if (placeholder > 0) problems.push(`${key}: placeholder`);
    if (leaked.length > 0) problems.push(`${key}: real names ${leaked.join(", ")}`);
    if (ms > SLOW_MS) problems.push(`${key}: ${ms} ms`);
  }
  check(
    `${STAGES[stage]}: ${keys.length} pages render their data, no real names`,
    problems.length === 0,
    problems.join("; "),
  );

  // A player profile from the squad, and a box score from the game log.
  await page.locator(`[data-testid="sidebar"] a[href$="/squad/${await userCid()}"]`).click();
  await page.locator('[data-testid="squad-table"] tbody tr a[href*="/player/"]').first().click();
  await page.locator('[data-testid="player-bio"]').waitFor({ timeout: 30_000 });
  const profileOk =
    (await page.locator('[data-testid="ratings"]').count()) === 1 && (await leaks()).length === 0;
  let boxOk = true;
  if (PLAYED.includes(stage)) {
    await page.locator(`[data-testid="sidebar"] a[href*="/game-log/"]`).click();
    await page.locator('[data-testid="game-log"] a[href*="/box-score/"]').first().click();
    await page.locator('[data-testid="box-score"]').waitFor({ timeout: 30_000 });
    boxOk = (await leaks()).length === 0;
  }
  check(
    `${STAGES[stage]}: a player profile${PLAYED.includes(stage) ? " and a box score" : ""} open`,
    profileOk && boxOk,
  );

  // The same figures on different pages: the record on the Dashboard, the Standings and
  // Team History, and the league position in the Power Rankings.
  await page.locator('[data-testid="sidebar"] a[href="/l/' + lid + '"]').click();
  await page.locator('[data-testid="club-summary"]').waitFor({ timeout: 30_000 });
  const summary = (await page.locator('[data-testid="club-summary"]').innerText()).match(
    /P(\d+) W(\d+) D(\d+) L(\d+) · (\d+) pts/,
  );
  const dash = summary
    ? { P: summary[1], W: summary[2], D: summary[3], L: summary[4], Pts: summary[5] }
    : null;
  await page.locator(`[data-testid="sidebar"] a[href^="/l/${lid}/standings"]`).click();
  await settled();
  await page
    .locator('[data-testid="standings-table"] tbody tr')
    .first()
    .waitFor({ timeout: 30_000 });
  const table = await rowCells("standings-table", club);
  await page.locator(`[data-testid="sidebar"] a[href*="/team-history/"]`).click();
  await page.locator('[data-testid="team-seasons"] tbody tr').first().waitFor({ timeout: 30_000 });
  const seasons = await page.locator('[data-testid="team-seasons"] tbody tr').first().innerText();
  const history = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="team-seasons"]');
    const heads = [...t.querySelectorAll("thead th")].map((th) =>
      th.textContent.replace(/ [▾▴]$/, "").trim(),
    );
    const cells = [...t.querySelector("tbody tr").children].map((td) => td.textContent.trim());
    return Object.fromEntries(heads.map((h, i) => [h, cells[i]]));
  });
  await page.locator(`[data-testid="sidebar"] a[href$="/power-rankings"]`).click();
  await page
    .locator('[data-testid="power-rankings"] tbody tr')
    .first()
    .waitFor({ timeout: 30_000 });
  const ranking = await rowCells("power-rankings", club);
  const same = (a, b, keys) => a && b && keys.every((k) => a[k] === b[k]);
  // After promotion and relegation the Standings open on the club's new league, without it.
  const moved = stage === 4 && table === null;
  check(
    `${STAGES[stage]}: Dashboard, Standings and Team History agree on the record`,
    moved ||
      (same(dash, table, ["P", "W", "D", "L", "Pts"]) &&
        same(table, history, ["P", "W", "D", "L", "Pts"]) &&
        /now/.test(seasons)),
    moved
      ? "moved league: checked again next preseason"
      : `P${table?.P} W${table?.W} D${table?.D} L${table?.L} ${table?.Pts} pts`,
  );
  check(
    `${STAGES[stage]}: Power Rankings shows the league position from the Standings`,
    moved || (table !== null && ranking?.Pos === table["#"]),
    `${ranking?.Pos} v ${table?.["#"]}`,
  );
  check(
    `${STAGES[stage]}: no errors in the console`,
    errors.length === 0,
    errors.slice(0, 3).join(" | "),
  );
}
async function userCid() {
  return (await page.locator('[data-testid="sidebar"] a[href*="/squad/"]').getAttribute("href"))
    .split("/")
    .at(-1);
}

// --- The season, with only the Play menu -----------------------------------------------------
await sweep(0);
await play("Until the window closes", `(${bar})().includes("31 Aug 2026")`);
await sweep(1);
for (let week = 0; week < 30 && !(await page.evaluate(bar)).includes("Winter window"); week++) {
  const before = await page.evaluate(bar);
  await play("One week", `(${bar})() !== ${JSON.stringify(before)}`);
}
check(
  "One week at a time reaches the winter window",
  (await page.evaluate(bar)).includes("Winter window"),
);
await sweep(2);
await play("Until the end of the season", `(${bar})().includes("End of season")`);
await sweep(3);

// The big tables, with a season of data in them.
const timed = async (label, act, until) => {
  const started = Date.now();
  await act();
  await page.waitForFunction(until, null, { timeout: 30_000 });
  const ms = Date.now() - started;
  check(`${label} in under ${SLOW_MS / 1000} s`, ms < SLOW_MS, `${ms} ms`);
};
await page.locator(`[data-testid="sidebar"] a[href$="/player-ratings"]`).click();
await page.locator('[data-testid="player-ratings"] tbody tr').first().waitFor({ timeout: 30_000 });
await timed(
  "Player Ratings shows every player at once",
  () =>
    page
      .locator('[data-testid="player-ratings"] select[aria-label="Rows per page"]')
      .selectOption({ label: "All rows" }),
  () => document.querySelectorAll('[data-testid="player-ratings"] tbody tr').length > 1500,
);
const firstName = () =>
  document.querySelector('[data-testid="player-ratings"] tbody tr')?.textContent ?? "";
const top = await page.evaluate(firstName);
await timed(
  "and sorts all of them by a rating",
  () => page.locator('[data-testid="player-ratings"] thead th').nth(8).click(),
  `(${firstName})() !== ${JSON.stringify(top)}`,
);
await page.locator(`[data-testid="sidebar"] a[href^="/l/${lid}/transactions"]`).click();
await page.locator('[data-testid="transactions"] tbody tr').first().waitFor({ timeout: 30_000 });
const total = Number(
  (await page.locator('[data-testid="transactions"]').innerText()).match(/(\d+) rows/)?.[1] ?? 0,
);
await timed(
  `Transactions shows the whole season at once (${total} rows)`,
  () =>
    page
      .locator('[data-testid="transactions"] select[aria-label="Rows per page"]')
      .selectOption({ label: "All rows" }),
  `document.querySelectorAll('[data-testid="transactions"] tbody tr').length === ${total} && ${total} > 50`,
);
await page.locator(`[data-testid="sidebar"] a[href^="/l/${lid}/player-stats"]`).click();
await page.locator('[data-testid="player-stats"] tbody tr').first().waitFor({ timeout: 30_000 });
await timed(
  "Player Stats switches to per 90",
  () => page.locator("#per-90").check(),
  () => document.querySelector("#min-minutes")?.value === "450",
);

await play("Proceed to promotion and relegation", `(${bar})().includes("1 Jun 2027")`);
await sweep(4);
// The finished season: History's champions are the Standings' top club.
await page.locator(`[data-testid="sidebar"] a[href$="/history"]`).click();
await page.locator('[data-testid="history-season"]').first().waitFor({ timeout: 30_000 });
const champion = await page
  .locator('[data-testid="history-season"] tbody tr')
  .first()
  .locator("td")
  .nth(1)
  .innerText();
await page.goto(`${BASE}/l/${lid}/standings/ENG1/2026`);
await page.locator('[data-testid="standings-table"] tbody tr').first().waitFor({ timeout: 30_000 });
const first = await page.locator('[data-testid="standings-table"] tbody tr').first().innerText();
check("History's champions top the final table", first.includes(champion), champion);
await play("Advance to preseason", `(${bar})().includes("2027/28")`);
await sweep(5);

const slowest = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 3);
console.log(
  `\nPage loads: ${timings.length}, median ${[...timings].sort((a, b) => a.ms - b.ms)[Math.floor(timings.length / 2)]?.ms} ms, slowest ${slowest.map((t) => `${t.key} ${t.ms} ms (${STAGES[t.stage]})`).join(", ")}`,
);
await context.close();
console.log(failures === 0 ? "\nThe full-season sweep passes." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
