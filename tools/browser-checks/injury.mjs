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
  await page
    .locator('[data-testid="club-choices"] button', { hasText: "Manchester Citizens" })
    .click();
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
    const tx = db.transaction(["meta", "players"], "readwrite");
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
  for (const route of [`squad/${cid}`, `tactics/${cid}`, ""]) {
    await page.goto(`${BASE}/l/${lid}/${route}?worker=dedicated`);
    const badge = page.getByTestId("injury-tag").first();
    await badge.waitFor();
    check(`${route || "Dashboard"}: injury badge is compact`, (await badge.innerText()) === "I");
    if (route) {
      const listed = page.locator(".status-badge").filter({ hasText: /^TL$/ }).first();
      await listed.hover();
      await page.getByRole("tooltip").waitFor();
      check(
        `${route}: transfer listing has a hover explanation`,
        /Transfer listed/.test(await page.getByRole("tooltip").innerText()),
      );
      await page.mouse.move(0, 0);
    }
    await badge.hover();
    const tooltip = page.getByRole("tooltip");
    await tooltip.waitFor({ state: "visible", timeout: 1000 });
    const text = await tooltip.innerText();
    check(
      `${route || "Dashboard"}: hovering immediately shows injury type, 21 days and return date`,
      /Hamstring strain: 21 days remaining; back 22 Jul 2026/.test(text),
    );
    check(
      `${route || "Dashboard"}: uses a visible tooltip rather than a delayed browser title`,
      (await badge.getAttribute("title")) === null &&
        (await badge.getAttribute("aria-describedby")) === (await tooltip.getAttribute("id")),
    );
    await page.mouse.move(0, 0);
    await tooltip.waitFor({ state: "detached" });
    await badge.focus();
    await tooltip.waitFor({ state: "visible", timeout: 1000 });
    check(
      `${route || "Dashboard"}: keyboard focus shows the same duration`,
      (await tooltip.innerText()) === text,
    );
    await page.keyboard.press("Escape");
    await tooltip.waitFor({ state: "detached" });
    check(
      `${route || "Dashboard"}: Escape dismisses the tooltip`,
      (await page.getByRole("tooltip").count()) === 0,
    );
  }
  await page.goto(`${BASE}/l/${lid}/squad/${cid}?worker=dedicated`);
  await page.setViewportSize({ width: 960, height: 600 });
  await page.getByTestId("injury-tag").first().hover();
  await page.getByRole("tooltip").waitFor({ state: "visible", timeout: 1000 });
  check(
    "the tooltip escapes table clipping and stays inside a short window",
    await page.getByRole("tooltip").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.top >= 0 &&
        r.right <= innerWidth &&
        r.bottom <= innerHeight &&
        el.parentElement === document.body
      );
    }),
  );
  check("no browser errors", errors.length === 0);
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
