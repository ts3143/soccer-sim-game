// The user's tactics are his alone (T, 2026-10-25): a new league saves the AI's pick as
// them, simulated matches start from them, and playing on never changes them.
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
const idle = () =>
  page.waitForFunction(
    () => !/Playing/.test(document.querySelector('[data-testid="play-button"]')?.textContent ?? ""),
    null,
    { timeout: 300_000 },
  );
const go = (path) => page.goto(`${BASE}${path}?worker=dedicated`);
const play = async (name) => {
  await page.locator('[data-testid="play-button"]').click();
  await page.locator('[data-testid="play-menu"]').getByRole("button", { name }).click();
};
const xi = page.locator('[data-testid="tactics-xi"] tbody tr');
const bench = page.locator('[data-testid="tactics-bench"] tbody tr');
const names = async (rows) =>
  (await rows.locator("td:nth-child(2) a").allInnerTexts()).map((t) => t.trim());
try {
  await page.goto(`${BASE}/new?worker=dedicated`);
  await page
    .locator('[data-testid="club-choices"] button', { hasText: "Manchester Citizens" })
    .click();
  await page.fill("#new-league-name", "Tactics");
  await page.fill("#new-league-seed", "tactics-check");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);

  await go(`/l/${lid}/tactics`);
  await xi.first().waitFor({ timeout: 30_000 });
  check(
    "a new league's tactics are already saved: the AI's pick, nothing to save",
    (await names(xi)).length === 11 &&
      (await page.getByText("No line-up saved yet").count()) === 0 &&
      (await page.locator('[data-testid="save-tactics"]').isDisabled()),
  );
  // His own pick: a substitute into the XI.
  const sub = (await names(bench))[1];
  await xi.nth(1).click();
  await bench.nth(1).click();
  await page.getByText("Unsaved changes").waitFor({ timeout: 15_000 });
  await page.waitForFunction(
    (n) =>
      document
        .querySelectorAll('[data-testid="tactics-xi"] tbody tr')[1]
        ?.querySelector("td:nth-child(2) a")
        ?.textContent?.trim() === n,
    sub,
  );
  const chosen = await names(xi);
  await page.locator('[data-testid="save-tactics"]').click();
  await page.locator('[data-testid="tactics-message"]').waitFor({ timeout: 15_000 });
  check(
    "saving says every match starts from it",
    /every match starts from it/i.test(
      await page.locator('[data-testid="tactics-message"]').innerText(),
    ),
  );

  // A simulated match starts from his XI.
  await go(`/l/${lid}`);
  await play("Until next match");
  await idle();
  await go(`/l/${lid}/game-log`);
  const result = page.locator('a[href*="/box-score/"]').last();
  await result.waitFor({ timeout: 30_000 });
  await result.click();
  await page.locator('[data-testid="box-score"]').waitFor({ timeout: 30_000 });
  const starters = await page
    .locator('[data-testid="box-score"] table')
    .evaluateAll((tables) =>
      tables.map((t) =>
        [...t.querySelectorAll("tbody tr")]
          .slice(0, 11)
          .map((tr) => tr.querySelector("td:nth-child(2) a")?.textContent?.trim() ?? ""),
      ),
    );
  const overlap = Math.max(...starters.map((s) => s.filter((n) => chosen.includes(n)).length));
  // Most of it: training injuries and rotation (a weak opponent) can rest a few.
  check("the simulated match started from his XI", overlap >= 8, `${overlap} of 11`);

  // Playing on never changes the saved tactics.
  await go(`/l/${lid}`);
  for (let i = 0; i < 3; i++) {
    await play("Until next match");
    await idle();
  }
  await go(`/l/${lid}/tactics`);
  await xi.first().waitFor({ timeout: 30_000 });
  check(
    "after four simulated matches the Tactics page still shows his XI, saved",
    JSON.stringify(await names(xi)) === JSON.stringify(chosen) &&
      (await page.getByText("Unsaved changes").count()) === 0,
    JSON.stringify(await names(xi)),
  );
  check("no browser errors", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
