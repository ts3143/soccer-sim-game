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
  await page.fill("#new-league-name", "Table readability regression");
  await page.fill("#new-league-seed", "table-readability");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);
  await page.close();
  page = await context.newPage();
  watch(page);
  await page.goto(`${BASE}/?worker=dedicated`);
  await page.locator('[data-testid="league-list"]').waitFor();
  const fixtures = await page.evaluate(async (lid) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(`league-${lid}`);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["meta", "fixtures"], "readwrite");
    const get = (r) =>
      new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const game = await get(tx.objectStore("meta").get("game"));
    const all = await get(tx.objectStore("fixtures").getAll());
    const mine = all
      .filter((f) => f.homeCid === game.userCid || f.awayCid === game.userCid)
      .sort((a, b) => a.date.localeCompare(b.date) || a.fid - b.fid)
      .slice(0, 3);
    const outcomes = ["W", "D", "L"];
    const patched = mine.map((f, i) => {
      const home = f.homeCid === game.userCid;
      const own = outcomes[i] === "W" ? 2 : outcomes[i] === "D" ? 1 : 0;
      const other = outcomes[i] === "L" ? 2 : outcomes[i] === "D" ? 1 : 0;
      tx.objectStore("fixtures").put({
        ...f,
        result: {
          homeGoals: home ? own : other,
          awayGoals: home ? other : own,
          winnerCid: null,
          penalties: null,
          extraTime: false,
        },
      });
      return { fid: f.fid, date: f.date, result: outcomes[i], cid: game.userCid };
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return patched;
  }, lid);
  const cid = fixtures[0].cid;
  const expectedClasses = { W: "table-success", D: "table-warning", L: "table-danger" };
  const assertRow = async (row, result, label) => {
    await row.waitFor();
    check(
      `${label}: ${result} colours the whole row`,
      await row.evaluate((tr, cls) => {
        if (!tr.classList.contains(cls)) return false;
        const cells = [...tr.querySelectorAll(":scope > td")];
        const bg = getComputedStyle(cells[0]).backgroundColor;
        return (
          cells.length > 1 &&
          bg !== "rgb(250, 250, 250)" &&
          cells.every((td) => getComputedStyle(td).backgroundColor === bg) &&
          getComputedStyle(cells[0]).getPropertyValue("--bs-table-striped-bg").trim() !== "#f0f1f2"
        );
      }, expectedClasses[result]),
    );
  };
  await page.goto(`${BASE}/l/${lid}?worker=dedicated`);
  await page.locator('[data-testid="recent-results"] tbody tr').first().waitFor();
  for (const f of fixtures)
    await assertRow(
      page.locator(`[data-testid="recent-results"] tr[data-result="${f.result}"]`),
      f.result,
      "Dashboard",
    );
  await page.goto(`${BASE}/l/${lid}/game-log/${cid}?worker=dedicated`);
  for (const f of fixtures)
    await assertRow(
      page
        .locator('[data-testid="game-log"] tbody tr')
        .filter({ has: page.locator(`a[href$="/box-score/${f.fid}"]`) }),
      f.result,
      "Game Log",
    );
  for (const f of fixtures) {
    const monday = new Date(`${f.date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    await page.goto(
      `${BASE}/l/${lid}/schedule/${monday.toISOString().slice(0, 10)}?worker=dedicated`,
    );
    await assertRow(
      page.locator(`[data-testid="schedule-day"] tr[data-result="${f.result}"]`),
      f.result,
      "Schedule",
    );
  }
  for (const [route, id] of [
    ["free-agents", "free-agents"],
    ["transfer-market", "market-search"],
    ["player-ratings", "player-ratings"],
    ["power-rankings", "power-rankings"],
  ]) {
    await page.goto(`${BASE}/l/${lid}/${route}?worker=dedicated`);
    const table = page.locator(`[data-testid="${id}"] table`);
    await table.locator("tbody tr").nth(1).waitFor();
    check(
      `${route}: light-grey rows alternate`,
      await table.evaluate((table) => {
        const rows = table.querySelectorAll(":scope > tbody > tr");
        const a = getComputedStyle(rows[0].querySelector("td"));
        const b = getComputedStyle(rows[1].querySelector("td"));
        return (
          table.classList.contains("table-striped") &&
          a.getPropertyValue("--bs-table-bg-type") !== b.getPropertyValue("--bs-table-bg-type") &&
          a.getPropertyValue("--bs-table-striped-bg").trim() === "#f0f1f2"
        );
      }),
    );
  }
  check("no browser errors", errors.length === 0);
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
