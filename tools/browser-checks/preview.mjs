// The pre-match card of a watched match (both clubs' last five, the last meeting, a
// derby), and on the profile: the Form card (his last five matches with ratings), his
// birthplace and his injury history (T, 2026-10-25).
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
try {
  await page.goto(`${BASE}/new?worker=dedicated`);
  await page.locator('[data-testid="club-choices"] button').first().click();
  await page.fill("#new-league-name", "Preview");
  await page.fill("#new-league-seed", "preview");
  await page.locator('[data-testid="start-league"]').click();
  await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60000 });
  const lid = Number(page.url().match(/\/l\/(\d+)/)[1]);

  // The first match: nothing played yet.
  await play("Watch your next match");
  await page.waitForFunction(() => location.pathname.endsWith("/live"), null, {
    timeout: 120_000,
  });
  const card = page.locator('[data-testid="match-preview"]');
  await card.waitFor({ timeout: 30_000 });
  const firstText = await card.innerText();
  check(
    "before a first match: no games yet, and no meeting",
    (firstText.match(/no games yet/g) ?? []).length === 2 &&
      /haven't met in this save/.test(firstText),
    firstText,
  );
  // Play it out, then six more matches.
  await page.locator('[data-testid="live-play"]').click();
  await page.locator('[data-testid="live-end"]').click({ timeout: 30_000 });
  await page.locator('[data-testid="live-done"]').waitFor({ timeout: 60_000 });
  await page.goto(`${BASE}/l/${lid}?worker=dedicated`);
  for (let i = 0; i < 6; i++) {
    await play("Until next match");
    await idle();
  }
  await play("Watch your next match");
  await page.waitForFunction(() => location.pathname.endsWith("/live"), null, {
    timeout: 120_000,
  });
  await card.waitFor({ timeout: 30_000 });
  const rows = card.locator('[data-testid="preview-form"]');
  const badges = await rows.evaluateAll((trs) =>
    trs.map((tr) =>
      [...tr.querySelectorAll("a.badge")].map((a) => ({
        text: a.textContent,
        href: a.getAttribute("href"),
        title: a.getAttribute("title"),
      })),
    ),
  );
  check(
    "both clubs show their last five as W/D/L badges",
    badges.length === 2 &&
      badges.every((b) => b.length === 5 && b.every((x) => /^[WDL]$/.test(x.text))),
    JSON.stringify(badges.map((b) => b.map((x) => x.text).join(""))),
  );
  check(
    "each badge links to its box score and says the score",
    badges.flat().every((x) => /\/box-score\/\d+$/.test(x.href) && /\d+–\d+/.test(x.title)),
    badges.flat()[0]?.title,
  );
  const meeting = await card.locator('[data-testid="last-meeting"]').innerText();
  check(
    "the last meeting is a played score or says they haven't met",
    /\d+–\d+/.test(meeting) || /haven't met in this save/.test(meeting),
    meeting,
  );
  const derby = await card.locator('[data-testid="derby"]').count();
  check(
    "a derby badge only names a city",
    derby === 0 || / derby$/.test(await card.locator('[data-testid="derby"]').innerText()),
  );
  // The badge leads to the box score.
  await card.locator("a.badge").first().click();
  await page.waitForFunction(() => /\/box-score\/\d+$/.test(location.pathname));
  check("a badge opens the box score", true);

  // A regular in the user's squad: the first of the first dozen with five matches.
  await page.goto(`${BASE}/l/${lid}/squad?worker=dedicated`);
  const links = page.locator('[data-testid="squad-table"] tbody tr td a[href*="/player/"]');
  await links.first().waitFor({ timeout: 30_000 });
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  let found = null;
  for (const href of hrefs.slice(0, 12)) {
    await page.goto(`${BASE}${href}?worker=dedicated`);
    const form = page.locator('[data-testid="player-form"]');
    await form.waitFor({ timeout: 30_000 });
    if ((await form.locator("tbody tr").count()) === 5) {
      found = form;
      break;
    }
  }
  check("a regular's profile shows his last five matches", found !== null);
  const birthplace = (await page.locator('[data-testid="birthplace"]').innerText()).trim();
  const bio = await page.locator('[data-testid="player-bio"]').innerText();
  check(
    "his bio lists his Birthplace, and his age just with the date",
    birthplace.length > 1 &&
      bio.includes(`Birthplace\n${birthplace}`) &&
      /\d+ \(born \d+ \w+ \d{4}\)/.test(bio),
    bio.slice(0, 300),
  );
  if (found) {
    const ratings = await found.locator('[data-testid="form-rating"]').allInnerTexts();
    check(
      "each with a rating and a box-score link",
      ratings.every((r) => /^\d+\.\d(★)?$/.test(r.replace(/\s/g, ""))) &&
        (await found.locator('tbody tr a[href*="/box-score/"]').count()) === 5,
      ratings.join(", "),
    );
  }
  // Someone injured now: the injury tops his history.
  await go(`/l/${lid}/injuries`);
  const injured = page.locator('[data-testid="injuries"] tbody tr').first();
  await injured.waitFor({ timeout: 30_000 });
  const type = (await injured.locator("td").nth(4).innerText()).trim();
  await injured.locator('a[href*="/player/"]').click();
  const history = page.locator('[data-testid="player-injuries"]');
  await history.waitFor({ timeout: 30_000 });
  const injuries = await history
    .locator('[data-testid="injury-row"]')
    .evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.innerText.trim())));
  check(
    "an injured player's history starts with his current injury, and says where",
    injuries.length > 0 &&
      injuries[0][1] === type &&
      injuries.every(
        (r) =>
          /^\d+ (days?|weeks)$/.test(r[2]) && /^(In training|In a match against .+)$/.test(r[3]),
      ),
    JSON.stringify(injuries),
  );
  check("the history says since when", (await history.innerText()).includes("Since 1 Jul 2026."));
  check("no browser errors", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
