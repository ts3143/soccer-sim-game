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
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
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
  // Fit highlights (T, 2026-10-21): picking or dragging a player marks the places he fits.
  const fitRows = page.locator(
    '[data-testid="tactics-bench"] tbody tr[data-fit], [data-testid="tactics-reserves"] tbody tr[data-fit]',
  );
  const fitPositions = () => fitRows.locator("td:nth-child(3)").allTextContents();
  const anyFit = () => page.locator("[data-fit]").count();
  await pitch.locator('[data-slot="0"]').click(); // the keeper, in every formation
  await fitRows.first().waitFor({ timeout: 10_000 });
  const keeperFits = await fitPositions();
  check(
    "picking the keeper highlights only keepers on the bench and in reserve",
    keeperFits.length > 0 && keeperFits.every((p) => p.trim() === "GK"),
    keeperFits.join(", "),
  );
  check(
    "no outfield slot lights up for a keeper",
    (await pitch.locator("[data-slot][data-fit]").count()) === 0,
  );
  await pitch.locator('[data-slot="0"]').click(); // picking him again puts him down
  await page.waitForFunction(() => document.querySelectorAll("[data-fit]").length === 0);
  check("putting the player down clears the highlights", (await anyFit()) === 0);
  await pitch.locator('[data-slot="5"]').click(); // an outfielder
  await fitRows.first().waitFor({ timeout: 10_000 });
  const outfieldFits = await fitPositions();
  check(
    "picking an outfielder highlights outfielders who suit his slot, never a keeper",
    outfieldFits.length > 0 && !outfieldFits.some((p) => p.trim() === "GK"),
    outfieldFits.join(", "),
  );
  check(
    "highlights come in two strengths only: natural and cover",
    await page
      .locator("[data-fit]")
      .evaluateAll((ns) => ns.every((n) => ["natural", "cover"].includes(n.dataset.fit))),
  );
  await pitch.locator('[data-slot="5"]').click();
  await page.waitForFunction(() => document.querySelectorAll("[data-fit]").length === 0);
  const spareKeeper = page
    .locator('[data-testid="tactics-bench"] tbody tr, [data-testid="tactics-reserves"] tbody tr')
    .filter({ has: page.locator("td:nth-child(3)", { hasText: /^GK$/ }) })
    .first();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await spareKeeper.dispatchEvent("dragstart", { dataTransfer });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="formation-pitch"] [data-slot="0"]')
        ?.getAttribute("data-fit") === "natural",
  );
  check(
    "dragging a spare keeper lights up the keeper's slot on the pitch, and only it",
    (await pitch.locator("[data-slot][data-fit]").count()) === 1,
  );
  await spareKeeper.dispatchEvent("dragend", { dataTransfer });
  await page.waitForFunction(() => document.querySelectorAll("[data-fit]").length === 0);
  check("ending the drag clears the highlights", (await anyFit()) === 0);

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
