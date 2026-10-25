// The live commentary (T, 2026-10-25): how each chance came about, one minute label per
// line, and a Key moments / Full commentary switch that is remembered.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` (${detail})`}`);
  if (!ok) failures++;
};
const MINUTE = /^\d+(\+\d+)?'$/;
/** Each line's minute column, badge and text. */
const lines = () =>
  page.locator('[data-testid="live-feed"] li').evaluateAll((items) =>
    items.map((li) => {
      const [minute, badge] = li.querySelectorAll("span");
      const text = [...li.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("")
        .trim();
      return { minute: minute?.textContent.trim() ?? "", badge: badge?.textContent ?? "", text };
    }),
  );
const pressed = async () =>
  (await page.locator('[data-testid="feed-mode"] [aria-pressed="true"]').innerText()).trim();
try {
  await page.goto(`${BASE}/new?worker=dedicated`);
  await page.locator('[data-testid="club-choices"] button').first().click();
  await page.fill("#new-league-name", "Commentary");
  await page.fill("#new-league-seed", "commentary");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  await page.locator('[data-testid="play-button"]').click();
  await page
    .locator('[data-testid="play-menu"]')
    .getByRole("button", { name: "Watch your next match" })
    .click();
  await page.waitForFunction(() => location.pathname.endsWith("/live"), null, {
    timeout: 120_000,
  });
  await page.locator('[data-testid="pre-match"]').waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="live-play"]').click();
  // Mid-match (past the first save, at 5 minutes): pick Key moments and reload.
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-testid="live-feed"] li span:first-child')].some(
        (s) => parseInt(s.textContent ?? "", 10) >= 12,
      ),
    null,
    { timeout: 60_000 },
  );
  check("the switch starts on Full commentary", (await pressed()) === "Full commentary");
  const mode = (name) =>
    page.locator('[data-testid="feed-mode"]').getByRole("button", { name }).click();
  await mode("Key moments");
  await page.reload();
  await page.locator('[data-testid="feed-mode"]').waitFor({ timeout: 60_000 });
  check("the choice is remembered after a reload", (await pressed()) === "Key moments");
  await page.locator('[data-testid="live-end"]').click({ timeout: 30_000 });
  await page.locator('[data-testid="live-done"]').waitFor({ timeout: 60_000 });
  const key = await lines();
  await mode("Full commentary");
  const full = await lines();

  const timed = full.filter((l) => l.minute !== "");
  check(
    "every line has one minute label, and none in its text",
    timed.length > 20 && timed.every((l) => MINUTE.test(l.minute) && !/^\d+(\+\d+)?'/.test(l.text)),
    timed.find((l) => !MINUTE.test(l.minute) || /^\d+(\+\d+)?'/.test(l.text))?.text,
  );
  const shots = full.filter((l) => / · xG \d\.\d\d$/.test(l.text));
  check(
    "shots say who made the chance and how it ended",
    shots.length > 5 && shots.every((l) => /\([^)]+\)/.test(l.text) && /, but /.test(l.text)),
    shots.find((l) => !/, but /.test(l.text))?.text,
  );
  const goals = full.filter((l) => l.text.startsWith("GOAL!"));
  const score = (await page.locator('[data-testid="live-score"]').innerText()).replace(/\s/g, "");
  const total = score
    .split("–")
    .map(Number)
    .reduce((a, b) => a + b, 0);
  check(
    "each goal line carries the score, the latest one the final score",
    goals.length === total &&
      goals.every((l) => /^GOAL! .+ \(.+\), \d+–\d+\. /.test(l.text)) &&
      (total === 0 || goals[0].text.includes(`, ${score}. `)),
    `${goals.length} goal lines, score ${score}`,
  );
  check(
    "Key moments keeps the goals, cards and subs, and only the big chances",
    key.length < full.length &&
      key.filter((l) => l.text.startsWith("GOAL!")).length === goals.length &&
      key.filter((l) => /^Substitution/.test(l.text)).length ===
        full.filter((l) => /^Substitution/.test(l.text)).length &&
      !key.some((l) => l.text.startsWith("Corner to")) &&
      key
        .filter((l) => / · xG \d\.\d\d$/.test(l.text))
        .every((l) => Number(l.text.slice(-4)) >= 0.3),
    `${key.length} of ${full.length} lines`,
  );
  check("no browser errors", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
