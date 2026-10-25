// M7 bug bash I: edge states. A brand-new league (every empty page says why), a season
// for the weakest top-flight club (a watched cup tie into extra time; relegation or
// survival seen on every page), an FFP ban and negative cash (written into the save while
// the game is closed), and addresses that name nothing.
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-edges-"));
let failures = 0;
const errors = [];
const leaks = new Set();
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 900 },
});
let page = await context.newPage();
const watch = (p) => {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
};
watch(page);
const testId = (id) => page.locator(`[data-testid="${id}"]`);
const main = () => page.locator("main").innerText();
const scan = async () => {
  const text = await page.locator("body").innerText();
  for (const n of expected.realNames) if (text.includes(n)) leaks.add(n);
};
const go = async (name) => {
  // Prefix match: the Dashboard link carries an unread count.
  await testId("sidebar")
    .getByRole("link", { name: new RegExp(`^${name}(\\s|$)`) })
    .first()
    .click();
  await page.waitForFunction(
    () => !document.querySelector("main")?.innerText.includes("Loading…"),
    null,
    { timeout: 30_000 },
  );
  await scan();
};
const idle = () =>
  page.waitForFunction(
    () => !/Playing/.test(document.querySelector('[data-testid="play-button"]')?.textContent ?? ""),
    null,
    { timeout: 300_000 },
  );
async function play(label) {
  await testId("play-button").click();
  const item = testId("play-menu").getByRole("button", { name: label, exact: true });
  if ((await item.count()) === 0) {
    await testId("play-button").click();
    return false;
  }
  await item.click();
  await page.waitForTimeout(100);
  await idle();
  return true;
}

// --- A: a brand-new league: empty pages say why ------------------------------------------------------
await page.goto(`${BASE}/new`);
// The weakest top-flight club (by the strength on its card): relegation is likeliest.
const cards = testId("club-choices").locator("button");
await cards.first().waitFor({ timeout: 30_000 });
const strengths = (await cards.allInnerTexts()).map((t) =>
  Number(t.match(/strength (\d+)/)?.[1] ?? 99),
);
const weakest = strengths.indexOf(Math.min(...strengths));
await cards.nth(weakest).click();
const club = (await testId("start-league").innerText()).replace(/^Start as /, "");
await page.fill("#new-league-name", "Edges");
// The seed decides whether a watched cup tie is level after 90 minutes. "edges-6" goes to
// extra time and penalties; an engine change can move that, and then another seed is needed.
await page.fill("#new-league-seed", "edges-6");
await testId("start-league").click();
await testId("top-bar").waitFor({ timeout: 60_000 });
const lid = Number(page.url().match(/\/l\/(\d+)/)?.[1]);
console.log(`      ${club} (strength ${Math.min(...strengths)})`);

const empties = [
  ["League Leaders", /No games yet/],
  ["Player Stats", /No matches played in this season yet/],
  ["Team Stats", /No league games played yet/],
  ["History", /The history starts when your first season ends/],
];
const missing = [];
for (const [pageName, message] of empties) {
  await go(pageName);
  if (!message.test(await main())) missing.push(pageName);
}
check("before any match, the empty pages say why", missing.length === 0, missing.join(", "));
await go("Injuries");
check(
  "Injuries says when no one is injured (or lists them)",
  /No one is injured/.test(await main()) ||
    (await testId("injuries").locator("tbody tr td").count()) > 1,
);
await go("Dashboard");
check(
  "the Dashboard's inbox has its welcome messages",
  /board/i.test(await testId("inbox-list").innerText()),
);
await go("Game Log");
const unplayed = testId("game-log").locator("tbody tr a[href*='/box-score/']").first();
if ((await unplayed.count()) > 0) {
  await unplayed.click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="box-score-missing"], [data-testid="box-score"]'),
    null,
    { timeout: 30_000 },
  );
}
await page.goto(`${BASE}/l/${lid}/box-score/1`);
await page.waitForFunction(
  () => document.querySelector('[data-testid="box-score-missing"], [data-testid="box-score"]'),
  null,
  { timeout: 30_000 },
);
check(
  "an unplayed match's box score says it hasn't been played",
  /not played yet/.test(await main()),
);

// --- B: a season: every cup tie watched until one goes to extra time ------------------------------
let extraTime = false;
let shootout = false;
let cupWatched = 0;
for (
  let match = 0;
  match < 70 && (await page.locator('[data-testid="play-button"]').isEnabled());
  match++
) {
  await go("Dashboard");
  const next = testId("next-match");
  if ((await next.count()) === 0) break;
  const competition = await next.locator("div").first().innerText();
  const cup = /cup|play-off/i.test(competition) && !extraTime;
  const actions = next.locator('[data-testid="next-match-actions"]');
  if ((await actions.count()) === 0) break;
  if (!cup) {
    await actions.getByRole("button", { name: "Simulate it" }).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="next-match-actions"] button[disabled]'),
      null,
      { timeout: 120_000 },
    );
    await idle();
    continue;
  }
  await actions.getByRole("button", { name: "Watch live" }).click();
  await page.waitForFunction(() => location.pathname.endsWith("/live"), null, { timeout: 120_000 });
  await testId("pre-match").waitFor({ timeout: 30_000 });
  cupWatched++;
  await page.locator("#live-speed").focus();
  await page.keyboard.press("End");
  await testId("live-play").click();
  for (;;) {
    await page.waitForFunction(
      () => document.querySelector('[data-testid="changes"], [data-testid="live-done"]'),
      null,
      { timeout: 120_000 },
    );
    if ((await testId("live-done").count()) > 0) break;
    const title = await testId("changes-title").innerText();
    if (title === "Extra time to come") extraTime = true;
    await testId("resume").click();
  }
  if (extraTime) shootout = (await testId("live-scoreboard").innerText()).includes("pens");
  await scan();
}
check(
  "a watched cup tie that's level after 90 minutes stops for extra time, and finishes (penalties if needed)",
  extraTime,
  `${cupWatched} cup ties watched${extraTime ? `, extra time${shootout ? " and penalties" : ""}` : ", none level"}`,
);
await play("Until the end of the season");
await go("Standings");
const table = await testId("standings-table").innerText();
const position = Number(
  table
    .split("\n")
    .find((l) => l.includes(club))
    ?.trim()
    .split(/\s+/)[0] ?? 0,
);
await play("Proceed to promotion and relegation");
await play("Advance to preseason");
await go("Dashboard");
const summary = await testId("club-summary").innerText();
const relegated = /second tier/.test(summary);
check(
  relegated
    ? "relegated: the Dashboard shows the new league"
    : "survived: the Dashboard shows the top flight",
  relegated ? /English second tier/.test(summary) : /English top flight/.test(summary),
  `${club} finished ${position}th`,
);
await go("Standings");
check(
  "Standings open on the club's league for the new season, with the club in it",
  (await testId("standings-table").innerText()).includes(club) &&
    (await page.getByText(relegated ? "English second tier" : "English top flight").count()) > 0,
);
await go("Team History");
const lastSeason = await testId("team-seasons").locator("tbody tr").nth(1).innerText();
check(
  "Team History records last season's finish (and relegation, if so)",
  /2026/.test(lastSeason) && (!relegated || /Relegated/.test(lastSeason)),
  lastSeason.replace(/\s+/g, " ").slice(0, 120),
);
// Whoever went down or up (the user's club usually survives): each is in its new league,
// and its Team History says why.
await go("History");
const topFlight = testId("history-season")
  .first()
  .locator("tbody tr", { hasText: "English top flight" });
const moved = async (column) => {
  const link = topFlight.locator("td").nth(column).locator("a").first();
  return {
    name: (await link.innerText()).trim(),
    cid: Number((await link.getAttribute("href"))?.match(/\/squad\/(\d+)/)?.[1]),
  };
};
const down = await moved(3);
const second = testId("history-season")
  .first()
  .locator("tbody tr", { hasText: "English second tier" });
const upLink = second.locator("td").nth(2).locator("a").first();
const up = {
  name: (await upLink.innerText()).trim(),
  cid: Number((await upLink.getAttribute("href"))?.match(/\/squad\/(\d+)/)?.[1]),
};
const standingsOf = async (leagueId) => {
  await page.goto(`${BASE}/l/${lid}/standings/${leagueId}`);
  await testId("standings-table").waitFor({ timeout: 30_000 });
  return testId("standings-table").innerText();
};
const eng2 = await standingsOf("ENG2");
const eng1 = await standingsOf("ENG1");
check(
  "relegated and promoted clubs play in their new leagues",
  eng2.includes(down.name) && !eng1.includes(down.name) && eng1.includes(up.name),
  `down: ${down.name}, up: ${up.name}`,
);
const honours = async (cid) => {
  await page.goto(`${BASE}/l/${lid}/team-history/${cid}`);
  await testId("team-seasons").waitFor({ timeout: 30_000 });
  return testId("team-seasons").locator("tbody tr").nth(1).innerText();
};
check(
  "their Team History says they went down or up",
  /Relegated from the English top flight/.test(await honours(down.cid)) &&
    /Promoted from the English second tier/.test(await honours(up.cid)),
);
await scan();
await go("Dashboard");
check(
  "the board sets a target for the new season",
  /board's target/i.test(await testId("inbox-list").innerText()),
);

// --- C: negative cash, then an FFP ban, written into the save while the game is closed ------------
await page.close();
await new Promise((r) => setTimeout(r, 1500)); // the shared worker stops once no page is open
page = await context.newPage();
watch(page);
/** Changes the user's club in the save. Each page load starts its own (dedicated) worker, so
 * from the league list nothing holds the league open. */
const patchUserClub = async (patch) => {
  await page.goto(`${BASE}/?worker=dedicated`);
  await testId("league-list").waitFor({ timeout: 30_000 });
  return page.evaluate(
    async ({ lid, patch }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(`league-${lid}`);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const tx = db.transaction(["meta", "clubs"], "readwrite");
      const get = (store, key) =>
        new Promise((res) => {
          const r = tx.objectStore(store).get(key);
          r.onsuccess = () => res(r.result);
        });
      const game = await get("meta", "game");
      const club = await get("clubs", game.userCid);
      const until = `${game.season + 1}-01-31`;
      const ffp = patch.ban ? { warned: true, bannedUntil: until } : club.ffp;
      tx.objectStore("clubs").put({ ...club, cash: patch.cash, ffp });
      await new Promise((res) => (tx.oncomplete = res));
      db.close();
      return until;
    },
    { lid, patch },
  );
};
const openBid = async () => {
  const row = testId("market-search").locator("tbody tr").first();
  await row.waitFor({ timeout: 30_000 });
  await row.getByRole("button", { name: "Bid" }).click();
  await testId("contract-modal").waitFor({ timeout: 15_000 });
  await testId("contract-blocked").waitFor({ timeout: 15_000 });
  const text = await testId("contract-blocked").innerText();
  await page.keyboard.press("Escape");
  return text;
};

await patchUserClub({ cash: -5_000_000, ban: false });
await page.goto(`${BASE}/l/${lid}/transfer-market?worker=dedicated`);
await testId("market-summary").waitFor({ timeout: 30_000 });
check(
  "negative cash: the Transfer Market says transfers are frozen",
  (await testId("cash-frozen").count()) === 1 &&
    !/FFP ban/.test(await testId("market-summary").innerText()),
);
check(
  "negative cash: the contract window says why a bid can't be made",
  /cash is below zero, so transfers are frozen/.test(await openBid()),
);

const banUntil = await patchUserClub({ cash: -5_000_000, ban: true });
await page.goto(`${BASE}/l/${lid}/transfer-market?worker=dedicated`);
await testId("market-summary").waitFor({ timeout: 30_000 });
const summaryText = await testId("market-summary").innerText();
check(
  "Transfer Market shows the FFP ban and a frozen transfer budget",
  /FFP ban until/.test(summaryText) && /Transfer budget\s*€0/.test(summaryText),
  summaryText.replace(/\n/g, " · "),
);
check(
  "the contract window says the ban stops signings",
  /FFP: your club can't sign anyone/.test(await openBid()),
);
await page.goto(`${BASE}/l/${lid}/club-finances?worker=dedicated`);
await testId("ffp").waitFor({ timeout: 30_000 });
check(
  "Finances & Facilities shows the ban and the negative cash",
  /banned/.test(await testId("ffp").innerText()) &&
    /Transfer ban until/.test(await testId("ffp").innerText()) &&
    (await testId("books").locator(".text-danger").count()) > 0,
  banUntil,
);
await page.goto(`${BASE}/l/${lid}/free-agents?worker=dedicated`);
await testId("free-agents-summary").waitFor({ timeout: 30_000 });
check(
  "Free Agents warns about the ban",
  /FFP transfer ban until/.test(await testId("free-agents-summary").innerText()),
);
await scan();

// --- D: addresses that name nothing ------------------------------------------------------------------
await page.goto(`${BASE}/l/${lid}/player/99999999?worker=dedicated`);
await testId("player-gone").waitFor({ timeout: 30_000 });
check(
  "an unknown player's address says so calmly",
  /There's no player 99999999/.test(await testId("player-gone").innerText()) &&
    (await page.locator(".alert-danger").count()) === 0,
);
await page.goto(`${BASE}/l/${lid}/no-such-page?worker=dedicated`);
await page.getByText("Page not found").waitFor({ timeout: 30_000 });
check(
  "an unknown page inside a league says so, with the league around it",
  (await testId("sidebar").count()) === 1,
);
await page.goto(`${BASE}/l/99?worker=dedicated`);
await page.waitForTimeout(1500);
check(
  "a league that doesn't exist shows an error, not a blank page",
  (await page.locator("body").innerText()).trim().length > 0,
  (await page.locator("body").innerText()).slice(0, 80),
);

check("no real club names on any page visited", leaks.size === 0, [...leaks].join(", "));
const unexpected = errors.filter((e) => !/No league 99/.test(e));
check("no errors in the console", unexpected.length === 0, unexpected.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll edge-state checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
