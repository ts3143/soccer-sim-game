// Headless Chrome check of the Super League in the game UI (MILESTONES SL7) against a
// running server (BASE): New game's world choice, then a Super League club's pages through
// a season and its draft.
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const SCRATCH = process.env.SCRATCH ?? tmpdir();
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(SCRATCH, "profile-superleague-"));
let failures = 0;
const errors = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const leakCheck = async (label) => {
  const text = await page.locator("body").innerText();
  const leaked = expected.realNames.filter((n) => text.includes(n));
  if (leaked.length) check(`no real club names on ${label}`, false, leaked.join(", "));
  return leaked.length === 0;
};

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// --- Chunk 1: New game's world choice; the shell of a Super League save --------------------
await page.goto(`${BASE}/new`);
await page.locator('[data-testid="world-choices"]').waitFor({ timeout: 30_000 });
check(
  "New game offers Classic and the Super League, Classic picked",
  (await page.locator('[data-testid="world-classic"]').getAttribute("aria-pressed")) === "true" &&
    (await page.locator('[data-testid="world-superLeague"]').count()) === 1,
);
await page.locator('[data-testid="world-superLeague"]').click();
await page.getByRole("button", { name: "Blue", exact: true }).waitFor({ timeout: 30_000 });
check(
  "the Super League lists its three tiers, Star first with 16 clubs",
  (await page.getByRole("button", { name: "Star", exact: true }).count()) === 1 &&
    (await page.getByRole("button", { name: "Gold", exact: true }).count()) === 1 &&
    (await page.locator('[data-testid="club-choices"] button').count()) === 16,
);
await page.getByRole("button", { name: "Blue", exact: true }).click();
await page.locator('[data-testid="club-choices"] button', { hasText: "Lyon Gones" }).click();
await leakCheck("New game (Super League)");
await page.fill("#new-league-name", "Super League test");
await page.fill("#new-league-seed", "super-league-ui");
await page.locator('[data-testid="start-league"]').click();
await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 90_000 });
const lid = page.url().match(/\/l\/(\d+)/)?.[1];
const bar = await page.locator('[data-testid="top-bar"]').innerText();
check(
  "the top bar shows trades open to the deadline, not a transfer window",
  /Trades open until/.test(bar) && !/window/i.test(bar) && /Lyon Gones/.test(bar),
  bar.replace(/\n/g, " | "),
);
const sidebar = await page.locator('[data-testid="sidebar"]').innerText();
check(
  "the sidebar has no Transfer Market or Youth Academy, and has Free Agents",
  !/Transfer Market/.test(sidebar) && !/Youth Academy/.test(sidebar) && /Free Agents/.test(sidebar),
);
await leakCheck("the dashboard");

// The user's player: release, but no transfer list or loan; another club's: no bid.
await page.goto(`${BASE}/l/${lid}/squad`);
await page.locator('[data-testid="squad-table"] a[href*="/player/"]').first().waitFor();
await page.locator('[data-testid="squad-table"] a[href*="/player/"]').first().click();
await page.locator('[data-testid="player-bio"]').waitFor();
check(
  "his own player can be released, not listed or loaned",
  (await page.locator('[data-testid="profile-release"]').count()) === 1 &&
    (await page.locator('[data-testid="profile-list"]').count()) === 0 &&
    (await page.getByRole("button", { name: "Loan out" }).count()) === 0,
);
await page.goto(`${BASE}/l/${lid}/squad/0`);
await page.locator('[data-testid="squad-table"] a[href*="/player/"]').first().click();
await page.locator('[data-testid="player-bio"]').waitFor();
check(
  "another club's player can't be bid for",
  (await page.locator('[data-testid="profile-talks"]').count()) === 0,
);

// --- Chunk 2: Standings for three tiers; the Play-offs page ---------------------------------
const testId = (id) => page.locator(`[data-testid="${id}"]`);
const idle = () =>
  page.waitForFunction(
    () => !/Playing/.test(document.querySelector('[data-testid="play-button"]')?.textContent ?? ""),
    null,
    { timeout: 600_000 },
  );
async function play(label) {
  await testId("play-button").click();
  await testId("play-menu").getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(150);
  await idle();
}
await page.goto(`${BASE}/l/${lid}/standings`);
await testId("standings-table").waitFor();
const blueRows = testId("standings-table").locator("tbody tr");
const zonesBlue = await testId("zones").innerText();
check(
  "Standings open on Blue: 16 clubs, champions, promotion (top 2) and play-offs (3rd-6th)",
  (await blueRows.count()) === 16 &&
    (await testId("standings-table").locator("tbody tr.table-success").count()) === 2 &&
    (await testId("standings-table").locator("tbody tr.table-info").count()) === 4 &&
    /Champions/.test(zonesBlue) &&
    /Promotion/.test(zonesBlue) &&
    /Play-offs/.test(zonesBlue),
  zonesBlue.replace(/\n/g, " | "),
);
const lotteryCells = await testId("standings-table")
  .locator("tbody tr td:nth-child(11)")
  .allInnerTexts();
check(
  "Blue's bottom 4 show their lottery odds (20%, 17%, 15%, 13%)",
  /Lottery/.test(await testId("standings-table").locator("thead").innerText()) &&
    lotteryCells.filter((t) => /%$/.test(t)).length === 4,
  lotteryCells.join(","),
);
await page.getByRole("link", { name: "Star", exact: true }).click();
await page.waitForFunction(() => /Star/.test(document.querySelector("main")?.innerText ?? ""));
await testId("zones").waitFor();
const zonesStar = await testId("zones").innerText();
check(
  "Star: the top 8 play for the title, the bottom 3 go down",
  /Title play-off/.test(zonesStar) &&
    /Relegation/.test(zonesStar) &&
    (await testId("standings-table").locator("tbody tr.table-info").count()) === 8 &&
    (await testId("standings-table").locator("tbody tr.table-danger").count()) === 3,
  zonesStar.replace(/\n/g, " | "),
);
await leakCheck("Standings");
check(
  "the sidebar has Play-offs, not Cups",
  /Play-offs/.test(await testId("sidebar").innerText()) &&
    !/\bCups\b/.test(await testId("sidebar").innerText()),
);
await page.getByRole("link", { name: "Play-offs", exact: true }).click();
await testId("playoff-projection").waitFor({ timeout: 30_000 });
const tabs = await page.locator("main .nav-pills").innerText();
check(
  "the Play-offs page has Star's, Gold's and Blue's, and Star's first round if the season ended today",
  /Star play-offs/.test(tabs) &&
    /Gold play-offs/.test(tabs) &&
    /Blue play-offs/.test(tabs) &&
    (await testId("playoff-projection").locator(".border").count()) === 4 &&
    /1\. /.test(await testId("playoff-projection").innerText()) &&
    /8\. /.test(await testId("playoff-projection").innerText()),
);
await page.getByRole("link", { name: "Blue play-offs" }).click();
await page.waitForFunction(() =>
  /3\./.test(document.querySelector('[data-testid="playoff-projection"]')?.textContent ?? ""),
);
check(
  "Blue's play-off if it ended today: 3rd v 6th and 4th v 5th",
  (await testId("playoff-projection").locator(".border").count()) === 2,
);

// A whole season: the brackets fill and the play-offs crown their winners.
await play("Until the end of the season");
await page.goto(`${BASE}/l/${lid}/cups`);
await testId("cup-rounds").waitFor();
await testId("cup-winner").waitFor({ timeout: 30_000 });
check(
  "after the season Star's play-off has its quarter-finals, semis and final, and a winner",
  (await testId("playoff-projection").count()) === 0 &&
    (await testId("cup-rounds").locator('[data-testid="cup-tie"]').count()) === 7 &&
    /won the Star play-offs/.test(await testId("cup-winner").innerText()),
);
await leakCheck("the Play-offs page");

// --- Chunk 3: the Draft and the team's draft picks --------------------------------------------
const sidebarNow = await testId("sidebar").innerText();
check(
  "the sidebar has the Draft and Draft Picks",
  /\bDraft\b/.test(sidebarNow) && /Draft Picks/.test(sidebarNow),
);
const pickRows = () => testId("draft-picks").locator("tbody tr");
await testId("sidebar").getByRole("link", { name: "Draft Picks", exact: true }).click();
await testId("draft-picks").waitFor();
const projected = await pickRows().locator("td:nth-child(3)").allInnerTexts();
check(
  "Draft Picks: his six own picks (two rounds of three drafts), this season's projected",
  (await pickRows().count()) === 6 &&
    projected.slice(0, 2).every((t) => /^~\d+/.test(t)) &&
    projected.slice(2).every((t) => t === "–"),
  projected.join(","),
);
await testId("sidebar").getByRole("link", { name: "Draft", exact: true }).click();
await testId("draft-lottery").waitFor();
const picker = await testId("draft-picker").locator("option").allInnerTexts();
check(
  "the Draft before the lottery: the pool from the final tables, the class, the drafts to come",
  (await testId("draft-lottery").locator("tbody tr").count()) === 8 &&
    /if the season ended today/.test(await testId("draft-lottery").innerText()) &&
    /Prospects \(110\)/.test(await page.locator("main").innerText()) &&
    picker.join(",") === "2027 draft,2028 draft (class),2029 draft (class)",
  picker.join(","),
);
await play("Proceed to promotion and relegation");
await play("Until the draft lottery");
await page.waitForURL(/\/draft$/);
await testId("draft-board").waitFor();
const drawn = await testId("draft-lottery").locator("tbody tr td:nth-child(4)").allInnerTexts();
check(
  "the lottery's day: the Draft page shows the draw (picks 1-8) and the board of 96",
  drawn
    .map((t) => Number.parseInt(t, 10))
    .sort((a, b) => a - b)
    .join(",") === "1,2,3,4,5,6,7,8" &&
    (await testId("draft-board").locator("tbody tr").count()) === 96,
  drawn.join(","),
);
await play("Until the draft");
await page.waitForURL(/\/draft$/);
// AI clubs pick up to his turn: then he's on the clock, or another club is.
await page.waitForFunction(() =>
  /on the clock/.test(document.querySelector('[data-testid="draft-status"]')?.textContent ?? ""),
);
if (!/You're on the clock/.test(await testId("draft-status").innerText())) {
  await play("Until your pick");
}
await page.waitForFunction(() =>
  /You're on the clock/.test(
    document.querySelector('[data-testid="draft-status"]')?.textContent ?? "",
  ),
);
const status = await testId("draft-status").innerText();
const ourPick = Number(status.match(/pick (\d+)/)?.[1]);
const firstProspect = testId("draft-prospects").locator("tbody tr").first();
const pickedName = await firstProspect.locator("a").innerText();
await firstProspect.getByRole("button", { name: "Draft" }).click();
await page.waitForFunction(
  (n) =>
    document
      .querySelector(`[data-testid="draft-board"] tr[data-pick="${n}"]`)
      ?.querySelector("a[href*='/player/']") !== null,
  ourPick,
);
check(
  "on the clock he drafts a prospect from the page; the board shows him at his pick",
  (await testId("draft-board").locator(`tr[data-pick="${ourPick}"]`).innerText()).includes(
    pickedName,
  ),
  `pick ${ourPick}: ${pickedName}`,
);
await play("To the end of the draft");
await page.waitForFunction(() =>
  /The draft is over/.test(
    document.querySelector('[data-testid="draft-status"]')?.textContent ?? "",
  ),
);
check(
  "to the end of the draft: every pick made",
  (await testId("draft-board").locator("tbody tr").count()) === 96 &&
    !/On the clock/.test(await testId("draft-board").innerText()),
);
await leakCheck("the Draft");
await testId("draft-board").locator(`tr[data-pick="${ourPick}"] a[href*="/player/"]`).click();
await testId("drafted").waitFor();
check(
  "his draftee's profile says where he was drafted",
  new RegExp(`^2027 round 1, pick ${ourPick} by LYO`).test(await testId("drafted").innerText()),
  await testId("drafted").innerText(),
);

// --- Chunk 4: Trade, the Trading Block, offers in the inbox ---------------------------------
const sidebarTrades = await testId("sidebar").innerText();
check(
  "the sidebar has Trade and the Trading Block",
  /\bTrade\b/.test(sidebarTrades) && /Trading Block/.test(sidebarTrades),
);
await testId("sidebar").getByRole("link", { name: "Trade", exact: true }).click();
await testId("trade-other").waitFor();
// Their weakest player he could trade for; what would make it work, then proposed.
const theirBoxes = testId("trade-other").locator("tbody input[type=checkbox]");
const wanted = theirBoxes.last();
const wantedPid = await wanted.locator("xpath=ancestor::tr").getAttribute("data-pid");
await wanted.check();
await page.waitForFunction(() =>
  /give/.test(document.querySelector('[data-testid="trade-summary"]')?.textContent ?? ""),
);
check(
  "ticking a player puts him in the summary, with the payrolls and squads after",
  /Payroll .*→/.test(await testId("trade-summary").innerText()) &&
    /Squad \d+ → \d+/.test(await testId("trade-summary").innerText()),
);
await testId("trade-work").click();
await testId("trade-answer").waitFor();
const workText = await testId("trade-answer").innerText();
const workable = /would (do it if you add|take it as it is)/.test(workText);
check('"What would make this work?" says what they\'d want', workable, workText);
if (workable) {
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid="propose-trade"]');
    return b !== null && !b.disabled;
  });
  await testId("propose-trade").click();
  await page.waitForFunction(() =>
    /Trade done with/.test(
      document.querySelector('[data-testid="trade-answer"]')?.textContent ?? "",
    ),
  );
  await page.waitForFunction(
    (pid) => document.querySelector(`[data-testid="trade-user"] tr[data-pid="${pid}"]`) !== null,
    wantedPid,
  );
  check("proposed, the trade is made: he's in your squad on the page", true);
}
await leakCheck("the Trade page");

// The trading block: offers for his best tradable player; one opened on the Trade page.
await testId("sidebar").getByRole("link", { name: "Trading Block", exact: true }).click();
await testId("block-assets").waitFor();
const putUp = testId("block-assets").locator("tbody input[type=checkbox]").first();
const putPid = await putUp.locator("xpath=ancestor::tr").getAttribute("data-pid");
await putUp.check();
await testId("block-ask").click();
await testId("block-offers").waitFor({ timeout: 60_000 });
const offerCount = await testId("block-offer").count();
check(
  "the trading block brings offers (at most five)",
  offerCount > 0 && offerCount <= 5,
  `${offerCount}`,
);
if (offerCount > 0) {
  await testId("block-offer").first().getByRole("button", { name: "Negotiate" }).click();
  await page.waitForURL(/\/trade\/\d+$/);
  await testId("trade-user").waitFor();
  check(
    "Negotiate opens the offer on the Trade page: his player and their side ticked",
    (await testId("trade-user").locator(`tr[data-pid="${putPid}"] input`).isChecked()) &&
      (await testId("trade-other").locator("input:checked").count()) > 0,
  );
}

// "Trade for him" on another club's player.
await page.goto(`${BASE}/l/${lid}/squad/0`);
await testId("squad-table").locator('a[href*="/player/"]').first().click();
const forPid = page.url().match(/\/player\/(\d+)/)?.[1];
await testId("profile-trade-for").click();
await page.waitForURL(/\/trade\/0$/);
await testId("trade-other").waitFor();
check(
  '"Trade for him" opens the Trade page with him asked for',
  await testId("trade-other").locator(`tr[data-pid="${forPid}"] input`).isChecked(),
);

// --- Chunk 5: re-signing, the cap on the finance pages, a free agent under the cap -----------
await play("Until the re-signing period");
check(
  "the sidebar has Re-sign Players",
  /Re-sign Players/.test(await testId("sidebar").innerText()),
);
await testId("sidebar").getByRole("link", { name: "Re-sign Players", exact: true }).click();
await testId("resigning-status").waitFor();
const resignRows = testId("resigning").locator("tbody tr");
const resignTexts = await resignRows.allInnerTexts();
check(
  "Re-sign Players: the period open, the cap now and next season's commitments",
  /open until 30 Jun 2027/.test(await testId("resigning-status").innerText()) &&
    (await testId("cap-summary").count()) === 1 &&
    /already committed/.test(await testId("resigning-next").innerText()),
  `${resignTexts.length} final-year player(s)`,
);
const willingRow = resignRows.filter({ hasNotText: "✕" }).filter({ hasText: "Negotiate" }).first();
if ((await willingRow.count()) > 0) {
  const resignName = await willingRow.locator("a").first().innerText();
  await willingRow.getByRole("button", { name: "Negotiate" }).click();
  await testId("contract-budget").locator('[data-testid="cap-summary"]').waitFor();
  await testId("contract-asks").locator("input[type=radio]:not([disabled])").first().check();
  await testId("agree-contract").click();
  await testId("contract-note").waitFor();
  const note = await testId("contract-note").innerText();
  await testId("contract-modal")
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    (name) =>
      !(document.querySelector('[data-testid="resigning"]')?.textContent ?? "").includes(name),
    resignName,
  );
  check(
    "he re-signs a willing player, the talks showing the cap; the player leaves the list",
    /signs a new contract/.test(note),
    note,
  );
} else {
  check("he has a final-year player willing to talk", false, resignTexts.join(" | "));
}
await testId("sidebar").getByRole("link", { name: "Finances & Facilities", exact: true }).click();
await testId("cap").waitFor();
check(
  "Finances & Facilities: the salary cap in place of FFP and the transfer budget; no youth dial",
  (await testId("ffp").count()) === 0 &&
    (await testId("budgets").count()) === 0 &&
    /against a cap of/.test(await testId("cap").innerText()) &&
    (await testId("dials").locator('input[type="range"]').count()) === 3,
);
await testId("sidebar").getByRole("link", { name: "Finances", exact: true }).click();
await testId("finances").waitFor();
const financeHead = await testId("finances").locator("thead").innerText();
check(
  "League Finances: each club's payroll, cap and room; no FFP",
  /Payroll/.test(financeHead) &&
    /Cap/.test(financeHead) &&
    /Room/.test(financeHead) &&
    !/FFP/.test(financeHead),
  financeHead.replace(/\s+/g, " "),
);

await play("Advance to preseason");
await testId("sidebar").getByRole("link", { name: "Free Agents", exact: true }).click();
await testId("free-agents").waitFor();
check(
  "Free Agents on 1 July: open, the cap room shown, the squad limit not yet counting",
  (await testId("free-agency-closed").count()) === 0 &&
    (await testId("cap-summary").count()) === 1 &&
    /limit counts from the first league match/.test(
      await testId("free-agents-summary").innerText(),
    ),
);
await page.locator("#fa-affordable").check();
const affordable = testId("free-agents")
  .locator("tbody tr")
  .filter({ hasText: "Negotiate" })
  .first();
if ((await affordable.count()) > 0) {
  await affordable.getByRole("button", { name: "Negotiate" }).click();
  await testId("contract-budget").locator('[data-testid="cap-summary"]').waitFor();
  await testId("contract-asks").locator("input[type=radio]:not([disabled])").first().check();
  await testId("agree-contract").click();
  await testId("contract-note").waitFor();
  const signed = await testId("contract-note").innerText();
  check("he signs a free agent within his cap room", /joins your club/.test(signed), signed);
  await testId("contract-modal")
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
} else {
  check("a willing free agent fits his cap room", false);
}

// AI clubs' offers reach the inbox from 8 July: answered there.
let offerBadge = null;
for (let week = 0; week < 10 && !offerBadge; week++) {
  await play("One week");
  await page.goto(`${BASE}/l/${lid}`);
  await testId("inbox").waitFor();
  const badge = testId("inbox-list").locator(".badge", { hasText: "Trade offer" });
  if ((await badge.count()) > 0) offerBadge = badge.first();
}
check("an AI club's trade offer comes to the inbox in July or August", offerBadge !== null);
if (offerBadge) {
  await offerBadge.locator("xpath=ancestor::article").locator(".inbox-message-toggle").click();
  await testId("trade-offer-actions").waitFor();
  await testId("trade-offer-actions").getByRole("button", { name: "Turn down" }).click();
  await page.waitForFunction(() =>
    /Offer turned down/.test(
      document.querySelector('[data-testid="inbox-list"]')?.textContent ?? "",
    ),
  );
  check("he turns it down in the inbox", true);
}

// --- Chunk 6: a trade with a pick, then on through three seasons -----------------------------
const money = (text) => {
  const n = Number.parseFloat(text.replace(/[^\d.]/g, ""));
  return /M/.test(text) ? n * 1e6 : /K/.test(text) ? n * 1e3 : n;
};
// Pick for pick (no wages move, so the cap doesn't stand in the way): his first-rounder in
// the furthest draft for their second-rounder in it.
await page.goto(`${BASE}/l/${lid}/trade/0`);
await testId("trade-user").waitFor();
// The trade page kept "Trade for him"'s trade: cleared first.
await testId("trade-summary").getByRole("button", { name: "Clear" }).click();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="trade-other"] input:checked').length === 0,
);
await testId("trade-user")
  .locator(".form-check", { hasText: "round 1" })
  .last()
  .locator("input")
  .check();
await testId("trade-other")
  .locator(".form-check", { hasText: "round 2" })
  .last()
  .locator("input")
  .check();
await page.waitForFunction(() => {
  const b = document.querySelector('[data-testid="propose-trade"]');
  return b !== null && !b.disabled;
});
await testId("propose-trade").click();
await testId("trade-answer").waitFor();
const pickTrade = await testId("trade-answer").innerText();
check(
  "a trade of draft picks: his first-rounder for their second-rounder",
  /Trade done/.test(pickTrade) && /round 1 pick/.test(pickTrade) && /round 2 pick/.test(pickTrade),
  pickTrade,
);

const squadSize = async () =>
  Number((await testId("free-agents-summary").innerText()).match(/Squad (\d+)\//)?.[1]);
/** In the summer: signs free agents he can afford until his squad is over 25. */
async function signToOver() {
  await page.goto(`${BASE}/l/${lid}/free-agents`);
  await testId("free-agents").waitFor();
  await page.locator("#fa-affordable").check();
  for (let i = 0; i < 10 && (await squadSize()) <= 25; i++) {
    const row = testId("free-agents").locator("tbody tr").filter({ hasText: "Negotiate" }).first();
    if ((await row.count()) === 0) break;
    await row.getByRole("button", { name: "Negotiate" }).click();
    await testId("contract-asks").locator("input[type=radio]:not([disabled])").first().check();
    await testId("agree-contract").click();
    await testId("contract-note").waitFor();
    await testId("contract-modal")
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await page.waitForTimeout(300);
  }
  return squadSize();
}

/** While Play waits on the squad limit, releases his cheapest players until it doesn't. */
async function releaseToLimit() {
  let released = 0;
  while ((await testId("blocked-banner").count()) > 0 && released < 15) {
    await page.goto(`${BASE}/l/${lid}/trade`);
    await testId("trade-user").waitFor();
    const rows = await testId("trade-user")
      .locator("tbody tr")
      .evaluateAll((trs) =>
        trs.map((tr) => [tr.getAttribute("data-pid"), tr.children[6]?.textContent ?? ""]),
      );
    const [pid] = rows.sort((a, b) => money(a[1]) - money(b[1]))[0];
    await page.goto(`${BASE}/l/${lid}/player/${pid}`);
    await testId("profile-release").click();
    await testId("release-confirm").click();
    await testId("profile-release").waitFor({ state: "detached" });
    released++;
    await page.goto(`${BASE}/l/${lid}`);
    await testId("top-bar").waitFor();
    await page.waitForTimeout(300);
  }
  return released;
}

for (const season of ["2027/28", "2028/29"]) {
  if (season === "2028/29") {
    const size = await signToOver();
    check("on 1 July he may hold more than 25 (free agents signed)", size > 25, `${size}/25`);
  }
  await play("Until the end of the season");
  if ((await testId("blocked-banner").count()) > 0) {
    const banner = await testId("blocked-banner").innerText();
    const released = await releaseToLimit();
    check(
      `${season}: over 25 at the first match, Play waits until he releases enough`,
      released > 0 && (await testId("blocked-banner").count()) === 0,
      `${banner.split(":")[0]}; released ${released}`,
    );
    await play("Until the end of the season");
  }
  check(
    `${season}: played to the season's end`,
    /End of season/.test(await testId("top-bar").innerText()),
  );
  await play("Proceed to promotion and relegation");
  await play("Until the draft lottery");
  await play("Until the draft");
  await play("To the end of the draft");
  await play("Until the re-signing period");
  await play("Advance to preseason");
}
await page.goto(`${BASE}/l/${lid}/team-history`);
await testId("team-seasons").waitFor();
const seasonRows = await testId("team-seasons").locator("tbody tr").allInnerTexts();
check(
  "three seasons played: his club's history has them, each finished in a tier",
  seasonRows.filter((r) => /20\d\d\/\d\d/.test(r) && /(Star|Gold|Blue)/.test(r)).length >= 3,
  seasonRows.map((r) => r.split("\t").slice(0, 3).join(" ")).join(" | "),
);
await leakCheck("Team History after three seasons");

await page.goto(`${BASE}/how-to-play`);
await testId("how-to-play-super-league").waitFor();
const guide = await testId("how-to-play-super-league").innerText();
check(
  "How to play has a Super League section: tiers, trades, the draft, re-signing, the cap",
  ["Star, Gold and Blue", "Trade", "draft", "Re-sign Players", "salary cap"].every((w) =>
    guide.includes(w),
  ),
);
await leakCheck("How to play");

// The names file at New game: a template to download, a bad file refused, a good one used.
await page.goto(`${BASE}/new`);
await testId("world-superLeague").click();
await page.getByRole("button", { name: "Blue", exact: true }).waitFor();
await testId("names-file").locator("summary").click();
const [download] = await Promise.all([
  page.waitForEvent("download"),
  testId("names-file").getByRole("button", { name: "Download a template" }).click(),
]);
const template = JSON.parse(readFileSync(await download.path(), "utf8"));
check(
  "New game's names template lists the 48 clubs by id with their names",
  download.suggestedFilename() === "club-names-superLeague.json" &&
    Object.keys(template.clubs).length === 48 &&
    template.clubs.lyo?.name === "Lyon Gones",
);
const namesFile = (name, clubs) => ({
  name,
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ clubs })),
});
await testId("names-file-input").setInputFiles(namesFile("bad.json", { xyz: { name: "X" } }));
await testId("names-file-problems").waitFor();
check(
  "a bad names file is refused, with the reason",
  /no club "xyz"/.test(await testId("names-file-problems").innerText()) &&
    (await testId("names-file-loaded").count()) === 0,
);
await testId("names-file-input").setInputFiles(
  namesFile("names.json", { lyo: { name: "Lyon Lions", short: "Lions", abbr: "LYL" } }),
);
await testId("names-file-loaded").waitFor();
await page.getByRole("button", { name: "Blue", exact: true }).click();
const renamedCard = testId("club-choices").locator("button", { hasText: "Lyon Lions" });
check(
  "a good one renames the club on New game",
  /1 club renamed/.test(await testId("names-file-loaded").innerText()) &&
    (await renamedCard.count()) === 1,
);
await renamedCard.click();
await page.fill("#new-league-name", "Names test");
await page.locator('[data-testid="start-league"]').click();
await testId("top-bar").waitFor({ timeout: 90_000 });
check(
  "the save uses the names file's names",
  /Lyon Lions/.test(await testId("top-bar").innerText()),
);

check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll Super League checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
