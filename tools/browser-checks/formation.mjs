// A deterministic injured-player fixture: verify the rendered tooltip, not a title attribute.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
let page = await context.newPage();
const errors = [];
const watch = (p) => p.on("pageerror", (e) => errors.push(e.message));
watch(page);
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};
try {
  await page.goto(`${BASE}/new?worker=dedicated`);
  await page.locator('[data-testid="club-choices"] button').first().click();
  await page.fill("#new-league-name", "Formation pitch regression");
  await page.fill("#new-league-seed", "formation-pitch");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);
  await page.goto(`${BASE}/l/${lid}/tactics`);
  const pitch = page.getByTestId("formation-pitch");
  const xi = page.locator('[data-testid="tactics-xi"] tbody tr');
  await xi.first().waitFor();
  const formations = await page.locator("#formation option").allTextContents();
  for (const formation of formations) {
    await page.locator("#formation").selectOption(formation);
    await page.waitForFunction(
      (f) =>
        document
          .querySelector('[data-testid="formation-pitch"]')
          ?.getAttribute("aria-label")
          ?.startsWith(f),
      formation,
    );
    const nodes = pitch.locator("[data-slot]");
    const ids = await nodes.evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.pid)));
    const tableIds = await xi
      .locator("td:nth-child(2) a")
      .evaluateAll((links) => links.map((a) => Number(a.getAttribute("href").split("/").at(-1))));
    check(
      `${formation}: all eleven pitch players match the table`,
      ids.length === 11 && JSON.stringify(ids) === JSON.stringify(tableIds),
    );
    check(
      `${formation}: all player cards fit inside the pitch`,
      await pitch.evaluate((p) => {
        const b = p.getBoundingClientRect();
        return [...p.querySelectorAll("[data-slot]")].every((n) => {
          const r = n.getBoundingClientRect();
          return r.left >= b.left && r.top >= b.top && r.right <= b.right && r.bottom <= b.bottom;
        });
      }),
    );
  }
  const slot = pitch.locator('[data-slot="10"]');
  const bench = page.locator('[data-testid="tactics-bench"] tbody tr');
  const replacement = await bench.first().locator("a").getAttribute("href");
  const replacementPid = replacement.split("/").at(-1);
  await bench.first().click();
  await slot.click();
  await page.waitForFunction(
    (pid) =>
      document
        .querySelector('[data-testid="formation-pitch"] [data-slot="10"]')
        ?.getAttribute("data-pid") === pid,
    replacementPid,
  );
  check(
    "a bench player can be selected in the table and placed on the pitch",
    (await xi.nth(10).locator("a").getAttribute("href")) === replacement,
  );
  const before = await pitch.locator('[data-slot="1"]').getAttribute("data-pid");
  const second = await pitch.locator('[data-slot="2"]').getAttribute("data-pid");
  await pitch.locator('[data-slot="1"]').focus();
  await page.keyboard.press("Enter");
  check(
    "keyboard selection highlights the pitch slot",
    await pitch
      .locator('[data-slot="1"]')
      .evaluate((el) => el.classList.contains("pitch-player-selected")),
  );
  await pitch.locator('[data-slot="2"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (pid) =>
      document
        .querySelector('[data-testid="formation-pitch"] [data-slot="2"]')
        ?.getAttribute("data-pid") === pid,
    before,
  );
  check(
    "keyboard selection swaps two pitch players",
    (await pitch.locator('[data-slot="1"]').getAttribute("data-pid")) === second,
  );
  await pitch.locator('[data-slot="1"]').dragTo(pitch.locator('[data-slot="2"]'));
  await page.waitForFunction(
    (pid) =>
      document
        .querySelector('[data-testid="formation-pitch"] [data-slot="1"]')
        ?.getAttribute("data-pid") === pid,
    before,
  );
  check(
    "dragging swaps pitch players and updates their table rows",
    (await xi.nth(1).locator("a").getAttribute("href")).endsWith(`/player/${before}`),
  );
  await page.locator('[data-testid="save-tactics"]').click();
  await page.getByTestId("tactics-message").waitFor();
  const saved = await pitch
    .locator("[data-slot]")
    .evaluateAll((ns) => ns.map((n) => n.dataset.pid));
  const playerHref = await xi.first().locator("a").getAttribute("href");
  await page.reload();
  await pitch.waitFor();
  check(
    "saving and reloading preserves the pitch lineup",
    JSON.stringify(saved) ===
      JSON.stringify(
        await pitch.locator("[data-slot]").evaluateAll((ns) => ns.map((n) => n.dataset.pid)),
      ),
  );
  const picker = page.getByTestId("team-picker");
  const other = await picker.locator("option").last().getAttribute("value");
  await picker.selectOption(other);
  await page.waitForFunction((cid) => location.pathname.endsWith(`/tactics/${cid}`), other);
  await pitch.waitFor();
  check(
    "another club's pitch is read-only",
    (await pitch.locator('[role="button"]').count()) === 0,
  );
  await page.goto(`${BASE}${playerHref}`);
  const map = page.getByTestId("position-pitch");
  await map.waitFor();
  check(
    "the profile maps every central and wide position",
    (await map.locator("[data-position]").count()) === 14,
  );
  const ovrs = Object.fromEntries(
    (await page.locator('[data-testid="position-ovrs"] .badge').allTextContents()).map((t) =>
      t.trim().split(/\s+/),
    ),
  );
  check(
    "every position marker agrees with the player's actual base OVR",
    await map
      .locator("[data-position]")
      .evaluateAll(
        (nodes, ovrs) => nodes.every((n) => n.dataset.ovr === ovrs[n.dataset.position]),
        ovrs,
      ),
  );
  check("the best position is highlighted", (await map.locator(".fit-best").count()) > 0);
  await page.setViewportSize({ width: 960, height: 600 });
  check(
    "the profile and position map fit a narrow laptop window",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  check("no browser errors", errors.length === 0);
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
