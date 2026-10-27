// Before a watched match (T, 2026-10-25): the saved tactics as they are. Injured and
// suspended players in them stay in their slots and kick-off waits until they're out (Auto
// does it); others who can't play are listed under Not in the squad, greyed out, and can't
// be picked.
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
  await page
    .locator('[data-testid="club-choices"] button', { hasText: "Manchester Citizens" })
    .click();
  await page.fill("#new-league-name", "Pre-match unavailable");
  await page.fill("#new-league-seed", "prematch-unavailable");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);
  await page.close();
  // The league is closed: in the save, injure the best outfielder of the saved XI and
  // suspend the next one, and injure a player outside the saved line-up.
  page = await context.newPage();
  watch(page);
  await page.goto(`${BASE}/?worker=dedicated`);
  await page.locator('[data-testid="league-list"]').waitFor();
  const [hurt, banned, outside] = await page.evaluate(async (lid) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(`league-${lid}`);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["meta", "players", "clubs"], "readwrite");
    const get = (r) =>
      new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const game = await get(tx.objectStore("meta").get("game"));
    const club = await get(tx.objectStore("clubs").get(game.userCid));
    const { slots, bench } = club.tactics.lineup;
    const players = await get(tx.objectStore("players").getAll());
    const mine = players
      .filter((p) => p.cid === game.userCid && p.status === "club" && p.position !== "GK")
      .sort((x, y) => y.ovr - x.ovr);
    const [a, b] = mine.filter((p) => slots.includes(p.pid));
    const c = mine.find((p) => !slots.includes(p.pid) && !bench.includes(p.pid));
    const injury = { type: "Hamstring strain", until: "2026-12-31", since: game.date };
    tx.objectStore("players").put({ ...a, injury });
    tx.objectStore("players").put({ ...b, suspension: { remaining: 2, date: game.date } });
    tx.objectStore("players").put({ ...c, injury });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return [a, b, c].map((p) => `${p.firstName} ${p.lastName}`.trim());
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
  const xiRows = pre.locator('[data-testid="tactics-xi"] tbody tr');
  const benchRows = pre.locator('[data-testid="tactics-bench"] tbody tr');
  const out = pre.locator('[data-testid="unavailable"]');
  const kickOff = page.locator('[data-testid="live-play"]');
  const blocked = page.locator('[data-testid="kickoff-blocked"]');
  const xiNames = await names(xiRows);
  check(
    "his saved XI is shown as it is: the injured and the suspended player in their slots",
    xiNames.includes(hurt) && xiNames.includes(banned),
    xiNames.join(", "),
  );
  check(
    "they carry their tags there: I and S2",
    (await xiRows.filter({ hasText: hurt }).getByTestId("injury-tag").innerText()) === "I" &&
      (await xiRows
        .filter({ hasText: banned })
        .locator(".status-badge", { hasText: /^S2$/ })
        .count()) === 1,
  );
  const reasons = (await blocked.count()) === 1 ? await blocked.innerText() : "";
  check(
    "Kick off is off, and the page names both and why",
    (await kickOff.isDisabled()) &&
      reasons.includes(`${hurt} (`) &&
      reasons.includes(") is injured.") &&
      reasons.includes(`${banned} (`) &&
      reasons.includes(") is suspended.") &&
      /press Auto/.test(reasons),
    reasons,
  );
  const outNames = await names(out);
  // (Training before the match may have added someone.)
  check(
    "a player outside his line-up who can't play is under Not in the squad; those in it aren't",
    outNames.includes(outside) && !outNames.includes(hurt) && !outNames.includes(banned),
    outNames.join(", "),
  );
  check(
    "it comes after the pickable reserves, greyed out",
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
  check(
    "it can't be dragged, focused or picked",
    (await out.evaluateAll((rows) =>
      rows.every((r) => !r.draggable && !r.hasAttribute("tabindex") && !r.hasAttribute("role")),
    )) &&
      (await out
        .first()
        .locator("td")
        .first()
        .click()
        .then(() => true)),
  );
  check(
    "clicking it picks nothing",
    (await pre.locator("tr.table-primary, [aria-pressed='true']").count()) === 0,
  );
  check("the note says what to do", /must come out before kick-off/.test(await pre.innerText()));

  // Auto: the AI's pick for this match leaves them out, and the match can start.
  await pre.getByRole("button", { name: "Auto" }).click();
  await blocked.waitFor({ state: "detached", timeout: 15_000 });
  const picked = [...(await names(xiRows)), ...(await names(benchRows))];
  check(
    "Auto takes them out of the XI and the bench, and Kick off comes on",
    !picked.includes(hurt) &&
      !picked.includes(banned) &&
      !(await kickOff.isDisabled()) &&
      (await names(out)).includes(hurt) &&
      (await names(out)).includes(banned),
  );
  // My saved line-up: back as saved, kick-off waits again.
  await pre.locator('[data-testid="use-saved"]').click();
  await blocked.waitFor({ timeout: 15_000 });
  check(
    "My saved line-up brings his tactics back as saved, and kick-off waits again",
    (await names(xiRows)).includes(hurt) && (await kickOff.isDisabled()),
  );
  await pre.getByRole("button", { name: "Auto" }).click();
  await blocked.waitFor({ state: "detached", timeout: 15_000 });
  await kickOff.click();
  await pre.waitFor({ state: "detached", timeout: 30_000 });
  check("then it kicks off", true);
  await kickOff.click();
  check("no browser errors", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
