// Headless Chrome check of the M3 Season lab against a running server (BASE).
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-m3-"));
let failures = 0;
const errors = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${BASE}/dev`);
await page.getByText("No leagues yet").waitFor();
await page.fill("#league-name", "Season test");
await page.fill("#league-seed", "season");
await page.getByRole("button", { name: "New league" }).click();
await page.getByText("M1 acceptance checks").waitFor({ timeout: 60_000 });

await page.getByRole("button", { name: "Season lab (M3)" }).click();
await page.getByText("Season 2026/27").waitFor({ timeout: 30_000 });
const header = await page.locator('[data-testid="season-header"]').innerText();
check(
  "a new league opens in preseason on 1 July with the window open",
  /1 Jul 2026/.test(header) && /Preseason/.test(header) && /Summer window open/.test(header),
);
const boardLine = await page.locator('[data-testid="board"]').innerText();
check(
  "the board target and confidence are shown",
  /Board target: \S/.test(boardLine) && /confidence \d+/.test(boardLine),
  boardLine.slice(0, 80),
);
check(
  "the inbox has the board's target message",
  /The board's target/.test(await page.locator('[data-testid="inbox"]').innerText()),
);
const buttons = await page
  .locator('[data-testid="season-header"]')
  .locator("button")
  .allInnerTexts();
check(
  "the Play options match the phase",
  buttons.join("|") === "Until next match|One week|Until window closes|Until end of season",
  buttons.join(", "),
);

const played = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="league-table"] tbody tr')].map((tr) =>
      Number(tr.children[3]?.textContent),
    ),
  );
const lastAction = page.locator('[data-testid="last-action"]');

await page.getByRole("button", { name: "Until next match" }).click();
await lastAction.waitFor({ timeout: 60_000 });
const firstMatch = await lastAction.innerText();
check(
  "Until next match plays up to the user's first match",
  /15 Aug 2026/.test(firstMatch),
  firstMatch,
);
check(
  "the user's league table has one game played",
  (await played()).every((p) => p === 1),
  (await played()).slice(0, 3).join(","),
);
check(
  "the phase is now the regular season",
  /Regular season/.test(await page.locator('[data-testid="season-header"]').innerText()),
);
check(
  "latest results are shown",
  (await page.locator('[data-testid="latest-results"] > div').count()) > 5,
);

await page.getByRole("button", { name: "One week" }).click();
await page.waitForFunction(
  () => /One week/.test(document.querySelector('[data-testid="last-action"]')?.textContent ?? ""),
  null,
  { timeout: 60_000 },
);
check(
  "One week moves the date on 7 days",
  /22 Aug 2026/.test(await lastAction.innerText()),
  await lastAction.innerText(),
);

// Reload mid-season: the save persists.
await page.reload();
await page
  .getByRole("button", { name: "Open" })
  .first()
  .click()
  .catch(() => undefined);
await page.getByRole("button", { name: "Season lab (M3)" }).click();
await page.getByText("Season 2026/27").waitFor({ timeout: 30_000 });
check(
  "after a reload the season carries on from 22 Aug",
  /22 Aug 2026/.test(await page.locator('[data-testid="season-header"]').innerText()),
);

// The rest of the season: timed. (The 60 s budget is for a whole season from 1 July; this is most of one.)
const started = Date.now();
await page.getByRole("button", { name: "Until end of season" }).click();
await page.getByText("End of season", { exact: true }).waitFor({ timeout: 180_000 });
const seconds = (Date.now() - started) / 1000;
check(
  "the rest of the season plays and saves in the browser well inside 60 s",
  seconds < 60,
  `${seconds.toFixed(1)} s`,
);
const awards = await page.locator('[data-testid="awards"]').innerText();
check(
  "the season's honours and awards are shown",
  /Champions/.test(awards) &&
    /Player of the Year/.test(awards) &&
    /Golden Boot/.test(awards) &&
    /Team of the Season/.test(awards) &&
    /Cup winners/.test(awards) &&
    /Promoted/.test(awards) &&
    /Relegated/.test(awards),
);
const knockouts = await page.locator('[data-testid="knockout-ENG2-PO"]').innerText();
const cupsDone = await page.locator('[data-testid^="knockout-"]').allInnerTexts();
check(
  "the play-offs and both cups were played to a winner",
  /Winner: (?!to be decided)/.test(knockouts) &&
    cupsDone.length === 3 &&
    cupsDone.every((t) => /Winner: (?!to be decided)/.test(t)),
  knockouts.split("\n").at(-1),
);

await page.getByRole("button", { name: "Proceed to promotion/relegation" }).click();
await page.getByRole("button", { name: "Advance to preseason" }).waitFor({ timeout: 60_000 });
const retirements = await page
  .locator(".card", { hasText: "Transactions this season" })
  .innerText();
check(
  "promotion/relegation day logs retirements",
  /Retirements and departures: \d+/.test(retirements),
);

const preseasonStarted = Date.now();
await page.getByRole("button", { name: "Advance to preseason" }).click();
await page.getByText("Season 2027/28").waitFor({ timeout: 120_000 });
const preseason = await page.locator('[data-testid="season-header"]').innerText();
check(
  "Advance to preseason starts 2027/28 on 1 July",
  /1 Jul 2027/.test(preseason) && /Preseason/.test(preseason),
  `${((Date.now() - preseasonStarted) / 1000).toFixed(1)} s`,
);
check(
  "this summer's youth intake reached the academies",
  /joined this summer/.test(await page.locator(".card", { hasText: "Academies" }).innerText()),
);
check(
  "the new season's tables start empty",
  (await played()).every((p) => p === 0),
);

// A whole season from 1 July, timed against the 60-second budget.
const wholeStarted = Date.now();
await page.getByRole("button", { name: "Until end of season" }).click();
await page.locator('[data-testid="season-time"]').waitFor({ timeout: 180_000 });
const seasonTime = await page.locator('[data-testid="season-time"]').innerText();
const budget = Number(/in ([\d.]+) s/.exec(seasonTime)?.[1]);
check(
  "a whole season (1 July to the final) plays in the browser under 60 s",
  budget > 0 && budget < 60,
  `${budget} s (wall ${((Date.now() - wholeStarted) / 1000).toFixed(1)} s)`,
);

await page.reload();
await page
  .getByRole("button", { name: "Open" })
  .first()
  .click()
  .catch(() => undefined);
await page.getByRole("button", { name: "Season lab (M3)" }).click();
await page.getByText("Season 2027/28").waitFor({ timeout: 30_000 });
check(
  "after a reload, season 2027/28 is still at its end",
  /End of season/.test(await page.locator('[data-testid="season-header"]').innerText()),
);

const text = await page.evaluate(() => document.body.innerText);
const leaked = expected.realNames.filter((n) => text.includes(n));
check("no real club names on the page", leaked.length === 0, leaked.join(", "));
await context.close();
check("no page errors or console errors", errors.length === 0, errors.join(" | "));
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
