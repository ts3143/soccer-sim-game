// Headless Chrome check of the M5 game UI against a running server (BASE).
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const SCRATCH = process.env.SCRATCH ?? tmpdir();
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(SCRATCH, "profile-m5-"));
let failures = 0;
const errors = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const leakCheck = async (label) => {
  const text = await page.locator("body").innerText();
  const leaked = expected.realNames.filter((n) => text.includes(n));
  if (leaked.length) check(`no real club names on ${label}`, false, leaked.join(", "));
  return leaked.length === 0;
};

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// --- Chunk 1: shell, routing, Play menu, Manage Leagues, New league ---------------------
await page.goto(BASE);
await page.locator('[data-testid="no-leagues"]').waitFor({ timeout: 30_000 });
check("a fresh browser lands on Manage Leagues with no saves", true);
await page.getByRole("link", { name: "Start a new league" }).click();
await page.locator('[data-testid="club-choices"] button').first().waitFor();
check(
  "New league lists the clubs of the first league",
  (await page.locator('[data-testid="club-choices"] button').count()) === 20,
);
await page.getByRole("button", { name: "English second tier" }).click();
check(
  "switching league tabs lists its clubs",
  (await page.locator('[data-testid="club-choices"] button').count()) === 24,
);
await page.locator('[data-testid="club-choices"] button', { hasText: "Lancashire Rovers" }).click();
check(
  "picking a club names the start button",
  /Start as Lancashire Rovers/.test(await page.locator('[data-testid="start-league"]').innerText()),
);
await leakCheck("the new league screen");
await page.fill("#new-league-name", "Shell test");
await page.fill("#new-league-seed", "shell");
await page.locator('[data-testid="start-league"]').click();
await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60_000 });
const lid = page.url().match(/\/l\/(\d+)/)?.[1];
check(
  "starting opens the league's dashboard",
  lid !== undefined && new URL(page.url()).pathname === `/l/${lid}`,
  page.url(),
);
const bar = await page.locator('[data-testid="top-bar"]').innerText();
check(
  "the top bar shows the date, season, phase, window and your club",
  /1 Jul 2026/.test(bar) &&
    /2026\/27 · Preseason/.test(bar) &&
    /Summer window/.test(bar) &&
    /Lancashire Rovers/.test(bar),
  bar.replace(/\n/g, " | "),
);
const sidebar = await page.locator('[data-testid="sidebar"]').innerText();
check(
  "the sidebar lists the sections and pages",
  [
    "GENERAL",
    "LEAGUE",
    "TEAM",
    "PLAYERS",
    "STATS",
    "TOOLS",
    "Standings",
    "Squad",
    "League Leaders",
    "Manage Leagues",
  ].every((t) => sidebar.toUpperCase().includes(t.toUpperCase())),
);

await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Standings" }).click();
check("sidebar links change the URL", new URL(page.url()).pathname === `/l/${lid}/standings`);
check(
  "a season page has a season dropdown",
  (await page.locator('[data-testid="season-picker"]').count()) === 1,
);
await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Squad" }).click();
const picker = page.locator('[data-testid="team-picker"]');
await picker.waitFor();
const userCid = await picker.inputValue();
check(
  "team pages open on your club with a team dropdown",
  new URL(page.url()).pathname === `/l/${lid}/squad/${userCid}`,
);
const other = await picker.locator("option", { hasText: "Dorset Cherries" }).getAttribute("value");
await picker.selectOption(other);
await page.waitForFunction((cid) => location.pathname.endsWith(`/squad/${cid}`), other);
check(
  "the team dropdown switches club",
  /Dorset Cherries/.test(await page.locator('[data-testid="page-header"]').innerText()),
);
await page.goBack();
await page.waitForFunction((cid) => location.pathname.endsWith(`/squad/${cid}`), userCid);
check("the browser's back button works", true);
await page.goto(`${BASE}/l/${lid}/squad/${other}`);
await page.locator('[data-testid="page-header"]').waitFor({ timeout: 30_000 });
check(
  "a deep link loads its page after a reload",
  /Dorset Cherries/.test(await page.locator('[data-testid="page-header"]').innerText()),
);

await page.locator('[data-testid="play-button"]').click();
const menu = await page.locator('[data-testid="play-menu"]').innerText();
check(
  "the Play menu offers the phase's options",
  /Until next match/.test(menu) &&
    /One week/.test(menu) &&
    /Until the window closes/.test(menu) &&
    /Until the end of the season/.test(menu),
  menu.replace(/\n/g, ", "),
);
await page
  .locator('[data-testid="play-menu"]')
  .getByRole("button", { name: "Until next match" })
  .click();
await page.waitForFunction(
  () => !/1 Jul 2026/.test(document.querySelector('[data-testid="game-date"]')?.textContent ?? ""),
  null,
  { timeout: 60_000 },
);
const after = await page.locator('[data-testid="game-date"]').innerText();
check(
  "Play → Until next match moves the date on from the top bar",
  /Aug 2026/.test(after) && /Regular season/.test(after),
  after.replace(/\n/g, " "),
);
await leakCheck("the league pages");

// --- Chunk 2: Dashboard, Inbox, the shared table ----------------------------------------
await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Dashboard" }).click();
await page.locator('[data-testid="club-summary"]').waitFor({ timeout: 30_000 });
const summary = await page.locator('[data-testid="club-summary"]').innerText();
check(
  "the Dashboard shows position, record and form",
  /in the English second tier/.test(summary) && /P1 /.test(summary) && /Form/.test(summary),
  summary.split("\n").slice(0, 3).join(" | "),
);
check(
  "the Dashboard shows the next match",
  (await page.locator('[data-testid="next-match"]').count()) === 1,
);
check(
  "recent results list the match just played",
  (await page.locator('[data-testid="recent-results"] tr').count()) >= 1,
);
const mini = page.locator('[data-testid="mini-table"] tbody tr');
check(
  "the mini league table shows seven rows with your club",
  (await mini.count()) === 7 && (await mini.filter({ hasText: "Lancashire Rovers" }).count()) === 1,
);
check(
  "the board card shows the target and confidence",
  /Target: \S/.test(await page.locator('[data-testid="board"]').innerText()) &&
    /Confidence \d+ of 100/.test(await page.locator('[data-testid="board"]').innerText()),
);
check("the alerts card is filled", (await page.locator('[data-testid="alerts"] li').count()) >= 1);
const unreadBefore = Number(await page.locator('[data-testid="unread"]').innerText());
check("the sidebar shows unread messages", unreadBefore > 0, String(unreadBefore));
await page.locator('[data-testid="inbox-preview"]').getByRole("link", { name: "Inbox" }).click();
await page.locator('[data-testid="inbox-list"]').waitFor();
await page.locator('[data-testid="inbox-list"] button').first().click();
await page.waitForFunction(
  (n) => Number(document.querySelector('[data-testid="unread"]')?.textContent ?? 0) < n,
  unreadBefore,
  { timeout: 15_000 },
);
check(
  "opening a message marks it read",
  (await page.locator('[data-testid="inbox-list"] button p').count()) === 1,
);
const markAll = page.getByRole("button", { name: "Mark all read" });
if (await markAll.isEnabled()) await markAll.click();
await page.waitForFunction(() => document.querySelector('[data-testid="unread"]') === null, null, {
  timeout: 15_000,
});
check(
  "with everything read the unread count goes and Mark all read is off",
  await markAll.isDisabled(),
);

// A few weeks on: the top performers table fills and sorts.
await page.locator('[data-testid="play-button"]').click();
await page
  .locator('[data-testid="play-menu"]')
  .getByRole("button", { name: "Until the window closes" })
  .click();
await page.waitForFunction(
  () => /31 Aug 2026/.test(document.querySelector('[data-testid="game-date"]')?.textContent ?? ""),
  null,
  { timeout: 60_000 },
);
await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Dashboard" }).click();
const top = page.locator('[data-testid="top-players"] tbody tr');
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="top-players"] tbody tr td').length > 1,
  null,
  { timeout: 30_000 },
);
const ratings = async () =>
  (await page.locator('[data-testid="top-players"] tbody tr td:last-child').allInnerTexts()).map(
    Number,
  );
const desc = await ratings();
check(
  "top performers are sorted by rating, best first",
  desc.length > 1 && desc.every((r, i) => i === 0 || r <= (desc[i - 1] ?? 99)),
  desc.join(","),
);
await page.locator('[data-testid="top-players"] th', { hasText: "Rating" }).click();
const asc = await ratings();
check(
  "clicking a heading reverses the sort",
  asc.every((r, i) => i === 0 || r >= (asc[i - 1] ?? 0)),
  asc.join(","),
);
check("rows are links to players", (await top.first().locator("a").count()) === 1);

// --- Chunk 3: Standings, Cups, Weekly Schedule --------------------------------------------
await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Standings" }).click();
const standings = page.locator('[data-testid="standings-table"] tbody tr');
await standings.first().waitFor({ timeout: 30_000 });
check(
  "Standings opens on your league with every club",
  (await standings.count()) === 24 &&
    (await standings.filter({ hasText: "Lancashire Rovers" }).count()) === 1,
);
const zoneText = await page.locator('[data-testid="zones"]').innerText();
check(
  "the zones are coloured and explained",
  /Champions/.test(zoneText) &&
    /Promotion/.test(zoneText) &&
    /Play-offs/.test(zoneText) &&
    (await page.locator('[data-testid="standings-table"] tbody tr.table-info').count()) === 6,
);
check(
  "the live table shows home, away and form",
  /Home/.test(await page.locator('[data-testid="standings-table"] thead').innerText()) &&
    (await page
      .locator('[data-testid="standings-table"] tbody tr')
      .first()
      .locator(".badge")
      .count()) > 0,
);
await page.getByRole("link", { name: "English top flight" }).click();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="standings-table"] tbody tr').length === 20,
  null,
  { timeout: 15_000 },
);
check("the league tabs switch league", /\/standings\/ENG1\//.test(page.url()));
const firstPts = Number(
  await page
    .locator('[data-testid="standings-table"] tbody tr')
    .first()
    .locator("td")
    .nth(9)
    .innerText(),
);
const lastPts = Number(
  await page
    .locator('[data-testid="standings-table"] tbody tr')
    .last()
    .locator("td")
    .nth(9)
    .innerText(),
);
check("the table is in position order", firstPts >= lastPts, `${firstPts} … ${lastPts}`);

await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Cups" }).click();
await page.locator('[data-testid="cup-rounds"]').waitFor({ timeout: 30_000 });
const ties = await page.locator('[data-testid="cup-tie"]').count();
check(
  "the English cup shows its rounds and the ties drawn so far",
  (await page.locator('[data-testid="cup-rounds"] section').count()) === 6 && ties >= 12,
  `${ties} ties`,
);
await page.getByRole("link", { name: "English second tier play-offs" }).click();
await page.waitForFunction(() => /ENG2-PO/.test(location.pathname), null, { timeout: 15_000 });
const playoffRounds = await page
  .waitForFunction(
    () => document.querySelectorAll('[data-testid="cup-rounds"] section').length === 3,
    null,
    { timeout: 15_000 },
  )
  .then(
    () => true,
    () => false,
  );
check(
  "the play-offs have their own tab with eliminators, semi-finals and final",
  playoffRounds && /Eliminators/.test(await page.locator('[data-testid="cup-rounds"]').innerText()),
);

await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Schedule" }).click();
await page.locator('[data-testid="week-picker"]').waitFor({ timeout: 30_000 });
const daysThisWeek = await page.locator('[data-testid="schedule-day"]').count();
check(
  "the schedule shows this week's matches day by day",
  daysThisWeek >= 1,
  `${daysThisWeek} days`,
);
const weekBefore = await page.locator('[data-testid="week-picker"]').inputValue();
await page.getByRole("button", { name: "Next week ›" }).click();
await page.waitForFunction(
  (w) => document.querySelector('[data-testid="week-picker"]')?.value !== w,
  weekBefore,
  { timeout: 15_000 },
);
check(
  "Next week moves on a week",
  new Date(await page.locator('[data-testid="week-picker"]').inputValue()) > new Date(weekBefore),
);
const allRows = await page.locator('[data-testid="schedule-day"] tbody tr').count();
await page.locator("#only-mine").check();
const mineRows = await page.locator('[data-testid="schedule-day"] tbody tr').count();
check(
  "Only my club filters to your matches",
  mineRows >= 1 &&
    mineRows < allRows &&
    (await page.locator('[data-testid="schedule-day"] tbody tr.table-primary').count()) ===
      mineRows,
  `${mineRows} of ${allRows}`,
);
await leakCheck("the league pages");

// --- Chunk 4: Squad, Player profile (part 1) ----------------------------------------------
await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Squad" }).click();
const squadRows = page.locator('[data-testid="squad-table"] tbody tr');
await squadRows.first().waitFor({ timeout: 30_000 });
check(
  "Squad lists your seniors with contracts, condition and value",
  (await squadRows.count()) >= 20 &&
    /€/.test(await squadRows.first().innerText()) &&
    /%/.test(await squadRows.first().innerText()),
);
check(
  "the squad summary shows league position, formation and wages",
  /in the English second tier/.test(
    await page.locator('[data-testid="squad-summary"]').innerText(),
  ) && /a year/.test(await page.locator('[data-testid="squad-summary"]').innerText()),
);
check(
  "the academy is listed",
  (await page.locator('[data-testid="academy-table"] tbody tr').count()) >= 5,
);
await page.locator('[data-testid="squad-table"] th', { hasText: "OVR" }).click();
const ovrs = (
  await page.locator('[data-testid="squad-table"] tbody tr td:nth-child(5)').allInnerTexts()
).map(Number);
check(
  "sorting the squad by OVR puts the best first",
  ovrs.every((o, i) => i === 0 || o <= (ovrs[i - 1] ?? 99)),
  ovrs.slice(0, 4).join(","),
);
const best = squadRows.first().locator("a").first();
const bestName = await best.innerText();
await best.click();
await page.locator('[data-testid="player-bio"]').waitFor({ timeout: 30_000 });
check(
  "clicking a player opens his profile",
  new RegExp(bestName).test(await page.locator('[data-testid="page-header"]').innerText()) &&
    /\/player\/\d+$/.test(page.url()),
);
const bio = await page.locator('[data-testid="player-bio"]').innerText();
check(
  "the profile shows OVR, POT, value and bio",
  /OVR/.test(bio) &&
    /POT/.test(bio) &&
    /Value €/.test(bio) &&
    /Nationality/.test(bio) &&
    /Height/.test(bio),
);
check(
  "the profile shows the contract",
  /a year until/.test(await page.locator('[data-testid="player-contract"]').innerText()),
);
check(
  "the mood breakdown lists its components and traits",
  (await page.locator('[data-testid="player-mood"] tbody tr').count()) >= 6 &&
    /Traits:/.test(await page.locator('[data-testid="player-mood"]').innerText()),
);
check(
  "all 22 ratings are shown by group",
  (await page.locator('[data-testid="ratings"] tbody tr').count()) === 22,
);
check(
  "OVR at every position is shown",
  (await page.locator('[data-testid="position-ovrs"] .badge').count()) === 10,
);
check(
  "the transfer history section is there",
  (await page.locator('[data-testid="player-transfers"]').count()) === 1,
);
// Chunk 5: radar, OVR/POT history, career.
check(
  "the ratings radar has its eight axes",
  (await page.locator('[data-testid="radar"] text').count()) === 8,
);
await page.locator('[data-testid="history-chart"] rect').hover();
check(
  "hovering the OVR/POT chart shows that update's values",
  /OVR \d+, POT \d+/.test(
    await page
      .locator('[data-testid="history-hover"]')
      .innerText()
      .catch(() => ""),
  ),
);
const careerRows = await page.locator('[data-testid="career"] tbody tr').count();
check(
  "career stats list this season and the career total",
  careerRows >= 2 && /Career/.test(await page.locator('[data-testid="career"]').innerText()),
  `${careerRows} rows`,
);
await page.goto(`${BASE}/l/${lid}/squad/${other}`);
await page.locator('[data-testid="squad-table"] tbody tr').first().waitFor({ timeout: 30_000 });
await page.locator('[data-testid="squad-table"] tbody tr').first().locator("a").first().click();
await page.locator('[data-testid="player-bio"]').waitFor({ timeout: 30_000 });
check(
  "another club's player shows his club",
  /Dorset Cherries/.test(await page.locator('[data-testid="page-header"]').innerText()),
);
await page
  .locator('[data-testid="top-bar"]')
  .getByRole("link", { name: "Lancashire Rovers" })
  .click();
await page.waitForFunction((cid) => location.pathname.endsWith(`/squad/${cid}`), userCid, {
  timeout: 15_000,
});
check("the top bar's club link opens your squad", true);
await leakCheck("the squad and player pages");

// --- Chunk 5: Box score, Game Log -----------------------------------------------------------
await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Dashboard" }).click();
await page.locator('[data-testid="recent-results"] a.font-monospace').first().click();
await page.locator('[data-testid="box-score"]').waitFor({ timeout: 30_000 });
const box = await page.locator('[data-testid="box-score"]').innerText();
check(
  "a result opens its box score with stats, events and both line-ups",
  /Possession/.test(box) &&
    /Key events/i.test(box) &&
    (await page.locator('[data-testid="box-score"] tbody tr').count()) > 30,
);
await page.locator('[data-testid="box-score"] table a').first().click();
await page.locator('[data-testid="player-bio"]').waitFor({ timeout: 30_000 });
check("box score player names link to their profiles", true);
await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Game Log" }).click();
const logRows = page.locator('[data-testid="game-log"] tbody tr');
await logRows.first().waitFor({ timeout: 30_000 });
check(
  "the game log lists your season's matches",
  (await logRows.count()) >= 38 &&
    /All competitions: W\d+ D\d+ L\d+/.test(
      await page.locator('[data-testid="game-log-record"]').innerText(),
    ),
  `${await logRows.count()} matches`,
);
check(
  "played matches show a result and a box-score link",
  (await page.locator('[data-testid="game-log"] tbody a.font-monospace').count()) >= 3,
);
await page.locator('[data-testid="team-picker"]').selectOption(other);
await page.waitForFunction((cid) => location.pathname.includes(`/game-log/${cid}`), other, {
  timeout: 15_000,
});
check(
  "the game log's team dropdown switches club",
  /Dorset Cherries/.test(await page.locator('[data-testid="page-header"]').innerText()),
);
await page.locator('[data-testid="game-log"] tbody a.font-monospace').first().click();
await page
  .locator('[data-testid="box-score"], [data-testid="box-score-missing"]')
  .first()
  .waitFor({ timeout: 30_000 });
check(
  "another club's result opens its box score",
  (await page.locator('[data-testid="box-score"]').count()) === 1,
);

// --- Chunk 6: Stats pages ---------------------------------------------------------------------
const sidebarLink = (name) =>
  page.locator('[data-testid="sidebar"]').getByRole("link", { name, exact: true });
await sidebarLink("League Leaders").click();
await page.locator('[data-testid="leaders-goals"] tbody tr').first().waitFor({ timeout: 30_000 });
check(
  "League Leaders shows eight categories with the top ten",
  (await page.locator('[data-testid="leaders"] > section').count()) === 8 &&
    (await page.locator('[data-testid="leaders-goals"] tbody tr').count()) === 10,
);
await page.getByRole("link", { name: "German top flight" }).click();
await page.waitForFunction(() => /league-leaders\/GER1/.test(location.pathname), null, {
  timeout: 15_000,
});
check("League Leaders switches league", true);

await sidebarLink("Player Ratings").click();
const ratingRows = page.locator('[data-testid="player-ratings"] tbody tr');
await ratingRows.first().waitFor({ timeout: 30_000 });
check(
  "Player Ratings pages through every player, 50 at a time",
  (await ratingRows.count()) === 50 &&
    /Page 1 of \d{2}/.test(await page.locator('[data-testid="player-ratings"]').innerText()),
);
await page.locator('select[aria-label="Position"]').selectOption("GK");
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="player-ratings"] tbody tr td:nth-child(3)')].every(
      (td) => td.textContent === "GK",
    ),
  null,
  { timeout: 15_000 },
);
check("the position filter keeps only that position", true);
check(
  "all 22 ratings are columns",
  (await page.locator('[data-testid="player-ratings"] thead th').count()) === 6 + 22,
);
const firstKeeper = await ratingRows.first().locator("a").first().innerText();
await page.locator('[data-testid="player-ratings"] input[aria-label="Filter"]').fill(firstKeeper);
check(
  "the filter box finds a player by name",
  (await ratingRows.count()) >= 1 && (await ratingRows.first().innerText()).includes(firstKeeper),
);

await sidebarLink("Player Stats").click();
const statRows = page.locator('[data-testid="player-stats"] tbody tr');
await statRows.first().waitFor({ timeout: 30_000 });
check(
  "Player Stats lists the season's players, top scorers first",
  (await statRows.count()) === 50,
);
await page.locator("#per-90").check();
check(
  "per 90 shows rates and sets a minutes minimum",
  (await page.locator("#min-minutes").inputValue()) === "450" &&
    /\./.test(await statRows.first().locator("td").nth(6).innerText()),
);
await page.locator('[data-testid="competition-picker"]').selectOption("ENG2");
await page.waitForFunction(() => /player-stats\/\d+\/ENG2/.test(location.pathname), null, {
  timeout: 15_000,
});
check("the competition dropdown narrows to one competition", true);

await sidebarLink("Team Stats").click();
const teamRows = page.locator('[data-testid="team-stats"] tbody tr');
await teamRows.first().waitFor({ timeout: 30_000 });
check(
  "Team Stats lists your league's clubs with possession and xG",
  (await teamRows.count()) === 24 && /%/.test(await teamRows.first().innerText()),
);

await sidebarLink("Injuries").click();
await page.locator('[data-testid="injuries"]').waitFor({ timeout: 30_000 });
const injured = await page.locator('[data-testid="injuries"] tbody tr').count();
const days = (
  await page.locator('[data-testid="injuries"] tbody tr td:last-child').allInnerTexts()
).map(Number);
check(
  "Injuries lists the injured, longest out first",
  injured >= 1 && days.every((d, i) => i === 0 || d <= (days[i - 1] ?? 999)),
  `${injured} rows`,
);
await leakCheck("the stats pages");

// --- Chunk 7: History, Team History, Transactions, Power Rankings, Finances --------------------
const CLUBS = 62;
const bodyText = () => page.locator("main").innerText();
await sidebarLink("History").click();
await page
  .getByText("The history starts when your first season ends.")
  .waitFor({ timeout: 30_000 });
check("History says it starts when the first season ends", true);

await sidebarLink("Team History").click();
const seasonRows = page.locator('[data-testid="team-seasons"] tbody tr');
await seasonRows.first().waitFor({ timeout: 30_000 });
check(
  "Team History shows this season so far, marked now",
  (await seasonRows.count()) === 1 && /2026\/27\s*now/.test(await seasonRows.first().innerText()),
);

await sidebarLink("Transactions").click();
const xRows = page.locator('[data-testid="transactions"] tbody tr');
await xRows.first().waitFor({ timeout: 30_000 });
check(
  "Transactions lists the summer's moves with fees",
  (await xRows.count()) === 50 &&
    /€/.test(await page.locator('[data-testid="transactions"]').innerText()),
);
await page.locator('select[aria-label="Type"]').selectOption("transfer");
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="transactions"] tbody tr td:nth-child(2)')].every(
      (td) => td.textContent === "Transfer",
    ),
  null,
  { timeout: 15_000 },
);
check("the type filter keeps only transfers", true);
const buyer =
  (await xRows.first().locator("td:nth-child(3)").innerText()).match(/ to (.+)$/)?.[1] ?? "";
await page.locator('select[aria-label="Type"]').selectOption("all");
await page.locator('select[aria-label="Club"]').selectOption({ label: buyer });
await page.waitForFunction(
  (club) => {
    const rows = [...document.querySelectorAll('[data-testid="transactions"] tbody tr')];
    return rows.length > 0 && rows.length < 50 && rows.every((tr) => tr.textContent.includes(club));
  },
  buyer,
  { timeout: 15_000 },
);
check("the club filter keeps one club's moves", true, `${buyer}: ${await xRows.count()}`);

await sidebarLink("Power Rankings").click();
const pr = page.locator('[data-testid="power-rankings"] tbody tr');
await pr.first().waitFor({ timeout: 30_000 });
const scores = async () =>
  (
    await page.locator('[data-testid="power-rankings"] tbody tr td:nth-child(3)').allInnerTexts()
  ).map(Number);
const s1 = await scores();
check(
  "Power Rankings opens on your league, best score first",
  (await pr.count()) === 24 && s1.every((s, i) => i === 0 || s <= (s1[i - 1] ?? 999)),
);
await page.locator('select[aria-label="League"]').selectOption("all");
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="power-rankings"] tbody tr').length > 24,
  null,
  { timeout: 15_000 },
);
check(
  "All leagues ranks every club with a league column",
  (await pr.count()) === CLUBS &&
    /League/.test(await page.locator('[data-testid="power-rankings"] thead').innerText()),
  String(await pr.count()),
);

await sidebarLink("Finances").click();
const fin = page.locator('[data-testid="finances"] tbody tr');
await fin.first().waitFor({ timeout: 30_000 });
check(
  "Finances lists every club with revenue, cash, wages and FFP",
  (await fin.count()) === CLUBS &&
    /FFP/.test(await page.locator('[data-testid="finances"] thead').innerText()) &&
    (await page.locator('[data-testid="finances"] .badge').count()) === CLUBS,
);
await page.locator('select[aria-label="League"]').selectOption("ENG2");
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="finances"] tbody tr').length === 24,
  null,
  { timeout: 15_000 },
);
check("the league filter narrows Finances", true);
await leakCheck("the history and finance pages");

// Play the season out from the Play menu, then look back at it.
const playOption = async (label, until) => {
  await page.locator('[data-testid="play-button"]').click();
  await page.locator('[data-testid="play-menu"]').getByRole("button", { name: label }).click();
  await page.waitForFunction(until, null, { timeout: 300_000 });
};
const barText = () => document.querySelector('[data-testid="top-bar"]')?.textContent ?? "";
await playOption("Until the end of the season", `(${barText})().includes("End of season")`);
await playOption(
  "Proceed to promotion and relegation",
  () => !document.querySelector('[data-testid="play-button"]')?.disabled,
);
await playOption("Advance to preseason", `(${barText})().includes("2027/28")`);
check("the Play menu plays the season out and starts the next", true);

await sidebarLink("History").click();
const card = page.locator('[data-testid="history-season"]');
await card.first().waitFor({ timeout: 30_000 });
const cardText = await card.first().innerText();
check(
  "History shows the finished season with champions, promotions, relegations and awards",
  (await card.count()) === 1 &&
    /2026\/27/.test(cardText) &&
    /English top flight/.test(cardText) &&
    /play-offs:/.test(cardText) &&
    /\(\d+\)/.test(cardText),
  cardText.split("\n").slice(0, 4).join(" | "),
);
check(
  "History lists the cup winners",
  /English cup: \S/.test(cardText) && /German cup: \S/.test(cardText) && !/cup: —/.test(cardText),
);
const champion = await card
  .first()
  .locator("tbody tr")
  .first()
  .locator("td:nth-child(2) a")
  .innerText();
await card.first().locator("tbody tr").first().locator("td:nth-child(2) a").click();
await page.waitForFunction(() => /\/squad\/\d+$/.test(location.pathname), null, {
  timeout: 15_000,
});
await page
  .locator('[data-testid="page-header"]')
  .filter({ hasText: champion })
  .waitFor({ timeout: 30_000 });
check("the champions link to their club", true, champion);

await sidebarLink("Team History").click();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="team-seasons"] tbody tr').length === 2,
  null,
  { timeout: 30_000 },
);
const last = await seasonRows.nth(1).innerText();
check(
  "Team History adds the finished season with its finish and record",
  /2026\/27/.test(last) && /\d+(st|nd|rd|th)/.test(last) && /\b46\b/.test(last),
  last.replace(/\s+/g, " "),
);

await sidebarLink("Transactions").click();
await page.locator('[data-testid="season-picker"]').selectOption("2026");
await page.waitForFunction(() => /transactions\/2026/.test(location.pathname), null, {
  timeout: 15_000,
});
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="transactions"] tbody tr td:nth-child(2)')].some(
      (td) => td.textContent === "Retirement",
    ),
  null,
  { timeout: 30_000 },
);
check("last season's transactions are kept, retirements included", true);

await sidebarLink("Finances").click();
await page.locator('[data-testid="season-picker"]').selectOption("2026");
await page.waitForFunction(
  () =>
    /finances\/2026/.test(location.pathname) &&
    document.querySelectorAll('[data-testid="finances"] tbody tr').length > 0 &&
    !/FFP/.test(document.querySelector('[data-testid="finances"] thead')?.textContent ?? "FFP"),
  null,
  { timeout: 30_000 },
);
check("last season's books show without live wages or FFP", /season's end/.test(await bodyText()));
await leakCheck("the history pages after a season");

await page.goto(BASE);
await page.locator('[data-testid="league-list"]').waitFor();
check(
  "Manage Leagues lists the save",
  /Shell test/.test(await page.locator('[data-testid="league-list"]').innerText()),
);
check(
  "Manage Leagues shows the version",
  /Soccer Sim v0\.1\.0/.test(await page.locator("main").innerText()),
);
await page.goto(`${BASE}/dev`);
await page.getByText("There's nothing here.").waitFor({ timeout: 30_000 });
check("the developer pages are gone (/dev is not a page)", true);

check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll M5 checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
