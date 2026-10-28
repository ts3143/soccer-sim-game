// Headless Chrome check of the Super League in the game UI (MILESTONES SL7) against a
// running server (BASE): New game's world choice, then a Super League club's pages.
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const SCRATCH = process.env.SCRATCH ?? tmpdir();
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(SCRATCH, "profile-superleague-"));
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

// --- Chunk 1: New game's world choice; the shell of a Super League save --------------------
await page.goto(`${BASE}/new`);
await page.locator('[data-testid="world-choices"]').waitFor({ timeout: 30_000 });
check(
  "New game offers Classic and the Super League, Classic picked",
  (await page.locator('[data-testid="world-classic"]').getAttribute("aria-pressed")) === "true" &&
    (await page.locator('[data-testid="world-superLeague"]').count()) === 1,
);
await page.locator('[data-testid="world-superLeague"]').click();
await page.getByRole("button", { name: "Blue", exact: true }).waitFor({ timeout: 30_000 });
check(
  "the Super League lists its three tiers, Star first with 16 clubs",
  (await page.getByRole("button", { name: "Star", exact: true }).count()) === 1 &&
    (await page.getByRole("button", { name: "Gold", exact: true }).count()) === 1 &&
    (await page.locator('[data-testid="club-choices"] button').count()) === 16,
);
await page.getByRole("button", { name: "Blue", exact: true }).click();
await page.locator('[data-testid="club-choices"] button', { hasText: "Lyon Gones" }).click();
await leakCheck("New game (Super League)");
await page.fill("#new-league-name", "Super League test");
await page.fill("#new-league-seed", "super-league-ui");
await page.locator('[data-testid="start-league"]').click();
await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 90_000 });
const lid = page.url().match(/\/l\/(\d+)/)?.[1];
const bar = await page.locator('[data-testid="top-bar"]').innerText();
check(
  "the top bar shows trades open to the deadline, not a transfer window",
  /Trades open until/.test(bar) && !/window/i.test(bar) && /Lyon Gones/.test(bar),
  bar.replace(/\n/g, " | "),
);
const sidebar = await page.locator('[data-testid="sidebar"]').innerText();
check(
  "the sidebar has no Transfer Market or Youth Academy, and has Free Agents",
  !/Transfer Market/.test(sidebar) && !/Youth Academy/.test(sidebar) && /Free Agents/.test(sidebar),
);
await leakCheck("the dashboard");

// The user's player: release, but no transfer list or loan; another club's: no bid.
await page.goto(`${BASE}/l/${lid}/squad`);
await page.locator('[data-testid="squad-table"] a[href*="/player/"]').first().waitFor();
await page.locator('[data-testid="squad-table"] a[href*="/player/"]').first().click();
await page.locator('[data-testid="player-bio"]').waitFor();
check(
  "his own player can be released, not listed or loaned",
  (await page.locator('[data-testid="profile-release"]').count()) === 1 &&
    (await page.locator('[data-testid="profile-list"]').count()) === 0 &&
    (await page.getByRole("button", { name: "Loan out" }).count()) === 0,
);
await page.goto(`${BASE}/l/${lid}/squad/0`);
await page.locator('[data-testid="squad-table"] a[href*="/player/"]').first().click();
await page.locator('[data-testid="player-bio"]').waitFor();
check(
  "another club's player can't be bid for",
  (await page.locator('[data-testid="profile-talks"]').count()) === 0,
);

// --- Chunk 2: Standings for three tiers; the Play-offs page ---------------------------------
const testId = (id) => page.locator(`[data-testid="${id}"]`);
const idle = () =>
  page.waitForFunction(
    () => !/Playing/.test(document.querySelector('[data-testid="play-button"]')?.textContent ?? ""),
    null,
    { timeout: 600_000 },
  );
async function play(label) {
  await testId("play-button").click();
  await testId("play-menu").getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(150);
  await idle();
}
await page.goto(`${BASE}/l/${lid}/standings`);
await testId("standings-table").waitFor();
const blueRows = testId("standings-table").locator("tbody tr");
const zonesBlue = await testId("zones").innerText();
check(
  "Standings open on Blue: 16 clubs, champions, promotion (top 2) and play-offs (3rd-6th)",
  (await blueRows.count()) === 16 &&
    (await testId("standings-table").locator("tbody tr.table-success").count()) === 2 &&
    (await testId("standings-table").locator("tbody tr.table-info").count()) === 4 &&
    /Champions/.test(zonesBlue) &&
    /Promotion/.test(zonesBlue) &&
    /Play-offs/.test(zonesBlue),
  zonesBlue.replace(/\n/g, " | "),
);
const lotteryCells = await testId("standings-table").locator("tbody tr td:nth-child(11)").allInnerTexts();
check(
  "Blue's bottom 4 show their lottery odds (20%, 17%, 15%, 13%)",
  /Lottery/.test(await testId("standings-table").locator("thead").innerText()) &&
    lotteryCells.filter((t) => /%$/.test(t)).length === 4,
  lotteryCells.join(","),
);
await page.getByRole("link", { name: "Star", exact: true }).click();
await page.waitForFunction(() => /Star/.test(document.querySelector("main")?.innerText ?? ""));
await testId("zones").waitFor();
const zonesStar = await testId("zones").innerText();
check(
  "Star: the top 8 play for the title, the bottom 3 go down",
  /Title play-off/.test(zonesStar) &&
    /Relegation/.test(zonesStar) &&
    (await testId("standings-table").locator("tbody tr.table-info").count()) === 8 &&
    (await testId("standings-table").locator("tbody tr.table-danger").count()) === 3,
  zonesStar.replace(/\n/g, " | "),
);
await leakCheck("Standings");
check(
  "the sidebar has Play-offs, not Cups",
  /Play-offs/.test(await testId("sidebar").innerText()) &&
    !/\bCups\b/.test(await testId("sidebar").innerText()),
);
await page.getByRole("link", { name: "Play-offs", exact: true }).click();
await testId("playoff-projection").waitFor({ timeout: 30_000 });
const tabs = await page.locator("main .nav-pills").innerText();
check(
  "the Play-offs page has Star's, Gold's and Blue's, and Star's first round if the season ended today",
  /Star play-offs/.test(tabs) &&
    /Gold play-offs/.test(tabs) &&
    /Blue play-offs/.test(tabs) &&
    (await testId("playoff-projection").locator(".border").count()) === 4 &&
    /1\. /.test(await testId("playoff-projection").innerText()) &&
    /8\. /.test(await testId("playoff-projection").innerText()),
);
await page.getByRole("link", { name: "Blue play-offs" }).click();
await page.waitForFunction(() =>
  /3\./.test(document.querySelector('[data-testid="playoff-projection"]')?.textContent ?? ""),
);
check(
  "Blue's play-off if it ended today: 3rd v 6th and 4th v 5th",
  (await testId("playoff-projection").locator(".border").count()) === 2,
);

// A whole season: the brackets fill and the play-offs crown their winners.
await play("Until the end of the season");
await page.goto(`${BASE}/l/${lid}/cups`);
await testId("cup-rounds").waitFor();
await testId("cup-winner").waitFor({ timeout: 30_000 });
check(
  "after the season Star's play-off has its quarter-finals, semis and final, and a winner",
  (await testId("playoff-projection").count()) === 0 &&
    (await testId("cup-rounds").locator('[data-testid="cup-tie"]').count()) === 7 &&
    /won the Star play-offs/.test(await testId("cup-winner").innerText()),
);
await leakCheck("the Play-offs page");

check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll Super League checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
