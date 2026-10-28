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

check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll Super League checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
