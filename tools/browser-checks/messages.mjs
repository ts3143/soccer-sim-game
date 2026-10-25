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
  await page.fill("#new-league-name", "Injury hover regression");
  await page.fill("#new-league-seed", "injury-tooltip");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);
  await page.close();
  page = await context.newPage();
  watch(page);
  await page.goto(`${BASE}/?worker=dedicated`);
  await page.locator('[data-testid="league-list"]').waitFor();
  const cid = await page.evaluate(async (lid) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(`league-${lid}`);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(["meta", "players", "inbox"], "readwrite");
    const get = (r) =>
      new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const game = await get(tx.objectStore("meta").get("game"));
    const players = await get(tx.objectStore("players").getAll());
    const p = players.find(
      (p) => p.cid === game.userCid && p.status === "club" && p.position !== "GK",
    );
    const name = `${p.firstName} ${p.lastName}`;
    tx.objectStore("inbox").put({
      mid: 99999,
      date: game.date,
      kind: "transfer",
      subject: `Regression signing: ${name}`,
      body: `${name} has signed.`,
      read: false,
      players: [{ pid: p.pid, name }],
    });
    const until = new Date(`${game.date}T00:00:00Z`);
    until.setUTCDate(until.getUTCDate() + 21);
    tx.objectStore("players").put({
      ...p,
      listed: { asking: 1234000, date: game.date },
      contract: { ...p.contract, expires: "2027-06-30" },
      injury: { type: "Hamstring strain", until: until.toISOString().slice(0, 10) },
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return game.userCid;
  }, lid);
  await page.goto(`${BASE}/l/${lid}?worker=dedicated`);
  const article = page.locator("article").filter({ hasText: "Regression signing" });
  const link = article.locator(".inbox-heading-content a");
  await link.waitFor();
  check("subject player mention is linked", (await link.count()) === 1);
  const href = await link.getAttribute("href");
  await article.locator("button").click();
  check(
    "expanded body player mention is linked",
    (await article.locator('[id^="inbox-body-"] a').count()) === 1,
  );
  check("links are outside toggle buttons", (await page.locator("button a").count()) === 0);
  await link.click();
  await page.waitForURL((url) => url.pathname === href);
  check("subject link navigates to player", new URL(page.url()).pathname === href);
  check("no browser errors", errors.length === 0);
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
