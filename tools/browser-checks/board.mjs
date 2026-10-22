// The live tactics board after a red card (T, 2026-10-21): a centre-back is sent off
// (written into the saved match), nobody can come on for him, and a substitute comes on
// for a midfielder and moves into the empty centre-back slot.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
let page = await context.newPage();
const errors = [];
const watch = (p) => p.on("pageerror", (e) => errors.push(e.message));
watch(page);
let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};
const testId = (id) => page.locator(`[data-testid="${id}"]`);
try {
  await page.goto(`${BASE}/new?worker=dedicated`);
  await page.locator('[data-testid="club-choices"] button').first().click();
  await page.fill("#new-league-name", "Red card board");
  await page.fill("#new-league-seed", "red-card-board");
  await testId("start-league").click();
  await testId("top-bar").waitFor({ timeout: 60_000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);
  await testId("play-button").click();
  await testId("play-menu").getByRole("button", { name: "Watch your next match" }).click();
  await testId("pre-match").waitFor({ timeout: 120_000 });
  await testId("live-play").click(); // kick off
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-testid="live-clock"]')?.textContent?.match(/^(\d+)'/)?.[1] ??
          0,
      ) >= 12,
    null,
    { timeout: 120_000 },
  );
  await testId("live-play").click(); // pause
  await testId("changes").waitFor({ timeout: 30_000 });

  // Send off the user's first centre-back in the saved match, with no page holding it open.
  await page.goto(`${BASE}/?worker=dedicated`);
  await testId("league-list").waitFor({ timeout: 30_000 });
  const sentOff = await page.evaluate(async (lid) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(`league-${lid}`);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["meta"], "readwrite");
    const live = await new Promise((res) => {
      const r = tx.objectStore("meta").get("live");
      r.onsuccess = () => res(r.result);
    });
    const team = live.state.teams[live.side];
    const index = team.plan.formation.slots.findIndex(
      (s, i) => s.position === "CB" && team.slots[i],
    );
    const p = team.slots[index];
    p.slot = null;
    p.sentOff = true;
    p.offMinute = Math.floor(live.state.clock / 60);
    team.slots[index] = null;
    team.stats.redCards += 1;
    tx.objectStore("meta").put(live, "live");
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
    return { index, pid: p.input.pid };
  }, lid);

  await page.goto(`${BASE}/l/${lid}/live?worker=dedicated`);
  const changes = testId("changes");
  await changes.locator('[data-testid="tactics-xi"] tbody tr').first().waitFor({ timeout: 30_000 });
  const slot = (i) => changes.locator(`[data-testid="formation-pitch"] [data-slot="${i}"]`);
  const pidAt = (i) => slot(i).getAttribute("data-pid");
  const bench = changes.locator('[data-testid="tactics-bench"] tbody tr');
  const apply = changes.locator('[data-testid="apply-changes"]');
  check(
    "after a red card the board shows his slot empty, and says you're down to 10",
    (await pidAt(sentOff.index)) === null &&
      /Move a player here/.test(await slot(sentOff.index).innerText()) &&
      /down to 10/.test(await changes.innerText()),
  );

  // Nobody can come on for him: a substitute dropped into his slot is refused.
  await bench.first().click();
  check(
    "a picked substitute doesn't light up the sent-off player's slot",
    (await slot(sentOff.index).getAttribute("data-fit")) === null,
  );
  await slot(sentOff.index).click();
  await testId("tactics-message").waitFor({ timeout: 15_000 });
  check(
    "dropping a substitute into the empty slot is refused, in plain words",
    /can't fill a sent-off player's place/.test(await testId("tactics-message").innerText()) &&
      (await pidAt(sentOff.index)) === null,
    await testId("tactics-message").innerText(),
  );

  // T's case: a centre-back (if there is one on the bench) on for a midfielder...
  const labels = await changes
    .locator('[data-testid="formation-pitch"] .pitch-slot-label')
    .allInnerTexts();
  const midfield = labels.findIndex((l) => /^(CM|DM|LM|RM|AM)$/.test(l.trim()));
  const positions = await bench.locator("td:nth-child(3)").allInnerTexts();
  const benchIndex = Math.max(
    0,
    positions.findIndex((p) => p.trim() === "CB"),
  );
  const subPid = (await bench.nth(benchIndex).locator("a").getAttribute("href")).split("/").at(-1);
  await bench.nth(benchIndex).click();
  await slot(midfield).click();
  await page.waitForFunction(
    () =>
      /Make changes \(1 substitution\)/.test(
        document.querySelector('[data-testid="apply-changes"]')?.textContent ?? "",
      ),
    null,
    { timeout: 15_000 },
  );
  // ...and moved into the empty centre-back slot.
  await slot(midfield).click();
  await slot(sentOff.index).click();
  await page.waitForFunction(
    ({ index, pid }) =>
      document
        .querySelector(
          `[data-testid="changes"] [data-testid="formation-pitch"] [data-slot="${index}"]`,
        )
        ?.getAttribute("data-pid") === pid,
    { index: sentOff.index, pid: subPid },
    { timeout: 15_000 },
  );
  check(
    "a substitute on for a midfielder can move into the empty slot, leaving the midfield slot empty",
    (await pidAt(midfield)) === null &&
      /Make changes \(1 substitution\)/.test(await apply.innerText()),
    `${positions[benchIndex]?.trim()} into slot ${sentOff.index}, ${labels[midfield]} slot empty`,
  );
  await apply.click();
  await page.waitForFunction(
    () => /Done: your changes are made/.test(document.body.textContent ?? ""),
    null,
    {
      timeout: 15_000,
    },
  );
  const card = await testId("my-team").innerText();
  check(
    "the change is made: one substitution used, still ten on the pitch, the substitute where he was put",
    /Subs 1\/5/.test(card) &&
      /Down to 10 players/.test(card) &&
      (await pidAt(sentOff.index)) === subPid &&
      (await pidAt(midfield)) === null,
  );
  check(
    "every player on the board has a rating so far",
    (await changes.locator('[data-testid="tactics-xi"] [data-testid="rating-so-far"]').count()) ===
      10,
  );
  await testId("resume").click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-testid="live-clock"]')?.textContent?.match(/^(\d+)'/)?.[1] ??
          0,
      ) >= 20,
    null,
    { timeout: 120_000 },
  );
  check(
    "the match plays on with ten",
    /Down to 10 players/.test(await testId("my-team").innerText()),
  );
  check("no browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
