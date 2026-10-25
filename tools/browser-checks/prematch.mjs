// Before a watched match (T, 2026-10-25): injured and suspended players are listed under
// Not in the squad, greyed out, and can't be picked.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
let page = await context.newPage();
const errors = [];
const watch = (p) => p.on("pageerror", (e) => errors.push(e.message));
watch(page);
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` (${detail})`}`);
  if (!ok) failures++;
};
const names = async (rows) =>
  (await rows.locator("td:nth-child(2) a").allInnerTexts()).map((t) => t.trim());
try {
  await page.goto(`${BASE}/new?worker=dedicated`);
  await page.locator('[data-testid="club-choices"] button').first().click();
  await page.fill("#new-league-name", "Pre-match unavailable");
  await page.fill("#new-league-seed", "prematch-unavailable");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);
  await page.close();
  // The league is closed: injure the best outfielder and suspend the next one in the save.
  page = await context.newPage();
  watch(page);
  await page.goto(`${BASE}/?worker=dedicated`);
  await page.locator('[data-testid="league-list"]').waitFor();
  const [hurt, banned] = await page.evaluate(async (lid) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(`league-${lid}`);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["meta", "players"], "readwrite");
    const get = (r) =>
      new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const game = await get(tx.objectStore("meta").get("game"));
    const players = await get(tx.objectStore("players").getAll());
    const [a, b] = players
      .filter((p) => p.cid === game.userCid && p.status === "club" && p.position !== "GK")
      .sort((x, y) => y.ovr - x.ovr);
    tx.objectStore("players").put({
      ...a,
      injury: { type: "Hamstring strain", until: "2026-12-31", since: game.date },
    });
    tx.objectStore("players").put({ ...b, suspension: { remaining: 2, date: game.date } });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return [a, b].map((p) => `${p.firstName} ${p.lastName}`.trim());
  }, lid);

  await page.goto(`${BASE}/l/${lid}?worker=dedicated`);
  await page.locator('[data-testid="play-button"]').click();
  await page
    .locator('[data-testid="play-menu"]')
    .getByRole("button", { name: "Watch your next match" })
    .click();
  await page.waitForFunction(() => location.pathname.endsWith("/live"), null, {
    timeout: 120_000,
  });
  const pre = page.locator('[data-testid="pre-match"]');
  await pre.waitFor({ timeout: 30_000 });
  const out = pre.locator('[data-testid="unavailable"]');
  const outNames = await names(out);
  check(
    "the injured and the suspended player are listed under Not in the squad",
    outNames.includes(hurt) && outNames.includes(banned),
    outNames.join(", "),
  );
  const hurtRow = out.filter({ hasText: hurt });
  const bannedRow = out.filter({ hasText: banned });
  check(
    "they carry their tags: I and S2",
    (await hurtRow.getByTestId("injury-tag").innerText()) === "I" &&
      (await bannedRow.locator(".status-badge", { hasText: /^S2$/ }).count()) === 1,
  );
  check(
    "they come after the pickable reserves, greyed out",
    (await pre
      .locator('[data-testid="tactics-reserves"] tbody tr')
      .last()
      .getAttribute("data-testid")) === "unavailable" &&
      Number(
        await out
          .first()
          .locator("td")
          .first()
          .evaluate((td) => getComputedStyle(td).opacity),
      ) < 1,
  );
  const picked = [
    ...(await names(pre.locator('[data-testid="tactics-xi"] tbody tr'))),
    ...(await names(pre.locator('[data-testid="tactics-bench"] tbody tr'))),
    ...(await names(pre.locator('[data-testid="tactics-reserves"] tbody tr:not([data-testid])'))),
  ];
  check(
    "they're nowhere else: not in the XI, the bench or the pickable reserves",
    !picked.includes(hurt) && !picked.includes(banned),
  );
  check(
    "they can't be dragged, focused or picked",
    (await out.evaluateAll((rows) =>
      rows.every((r) => !r.draggable && !r.hasAttribute("tabindex") && !r.hasAttribute("role")),
    )) &&
      (await hurtRow
        .locator("td")
        .first()
        .click()
        .then(() => true)),
  );
  check(
    "clicking one picks nothing",
    (await pre.locator("tr.table-primary, [aria-pressed='true']").count()) === 0,
  );
  check(
    "the note says why",
    /Injured and suspended players are greyed out/.test(await pre.innerText()),
  );
  check("no browser errors", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
