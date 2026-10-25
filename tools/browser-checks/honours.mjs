// Honours (T, 2026-10-25): the new Top assists award on History, and a player's honours
// on his profile: an Honours card and ZenGM-style badges on his Career rows.
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
const go = (path) => page.goto(`${BASE}${path}${path.includes("?") ? "&" : "?"}worker=dedicated`);
/** The profile's Honours lines and the Career rows' badges, by competition. */
const honoursOn = async () => {
  await page.locator('[data-testid="player-honours"]').waitFor({ timeout: 30_000 });
  const lines = await page.locator('[data-testid="honour"]').allInnerTexts();
  const badges = await page
    .locator('[data-testid="career"] tbody tr')
    .evaluateAll((trs) =>
      trs.flatMap((tr) =>
        [...tr.querySelectorAll('[data-testid="honour-badge"]')].map(
          (b) => `${tr.cells[2]?.childNodes[0]?.textContent}: ${b.textContent}`,
        ),
      ),
    );
  return { lines, badges };
};
try {
  await page.goto(`${BASE}/new?worker=dedicated`);
  await page.locator('[data-testid="club-choices"] button').first().click();
  await page.fill("#new-league-name", "Honours");
  await page.fill("#new-league-seed", "honours");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);
  await page.locator('[data-testid="play-button"]').click();
  await page
    .locator('[data-testid="play-menu"]')
    .getByRole("button", { name: "Until the end of the season" })
    .click();
  await page.waitForFunction(
    () =>
      /End of season/.test(document.querySelector('[data-testid="top-bar"]')?.textContent ?? "") &&
      !/Playing/.test(document.querySelector('[data-testid="play-button"]')?.textContent ?? ""),
    null,
    { timeout: 600_000 },
  );

  await go(`/l/${lid}/history`);
  const season = page.locator('[data-testid="history-season"]').first();
  await season.waitFor({ timeout: 30_000 });
  const providers = await season.locator('[data-testid="top-assists"]').allInnerTexts();
  check(
    "History lists each league's top assists provider and his tally",
    providers.length === 3 && providers.every((t) => /\S.* \(\d+\)$/.test(t.trim())),
    providers.join(" | "),
  );
  const leagueName = (await season.locator("tbody tr td").first().innerText()).trim();

  // The first league's provider: the award on his card and on that league's Career row.
  await season.locator('[data-testid="top-assists"] a').first().click();
  await page.waitForFunction(() => /\/player\/\d+/.test(location.pathname));
  const provider = await honoursOn();
  check(
    "his Honours card lists Top assists",
    provider.lines.some((l) => /^1× Top assists /.test(l) && l.includes(leagueName)),
    provider.lines.join(" | "),
  );
  check(
    "his Career row for that league carries a Top assists badge",
    provider.badges.includes(`${leagueName}: Top assists`),
    provider.badges.join(" | "),
  );

  // The champions: a regular of theirs has a Champion badge on that league's row.
  await go(`/l/${lid}/history`);
  await season.waitFor({ timeout: 30_000 });
  await season.locator("tbody tr").first().locator("td").nth(1).locator("a").click();
  const links = page.locator('[data-testid="squad-table"] tbody tr td a[href*="/player/"]');
  await links.first().waitFor({ timeout: 30_000 });
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  let champion = null;
  for (const href of hrefs.slice(0, 8)) {
    await go(href);
    const got = await honoursOn();
    if (got.badges.includes(`${leagueName}: Champion`)) {
      champion = got;
      break;
    }
  }
  check(
    "a champion's Honours card and Career row show Champion",
    champion !== null && champion.lines.some((l) => /^1× Champion /.test(l)),
    JSON.stringify(champion),
  );
  check("no browser errors", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
