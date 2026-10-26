// M6 acceptance (docs/MILESTONES.md): run the user's club through three seasons entirely in
// the game's screens: sign, sell, loan, renew, set tactics, watch and change a match live,
// promote academy players. Each step goes through the UI only; the end checks read the
// game's own records (Transactions, History) to confirm every kind of action happened.
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-career-"));
const SEASONS = 3;
const CLUB = "Lancashire Rovers";
let failures = 0;
const errors = [];
const leaks = new Set();
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const log = (text) => console.log(`      ${text}`);

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// --- Helpers ---------------------------------------------------------------------------------------
const testId = (id) => page.locator(`[data-testid="${id}"]`);
const go = async (name) => {
  // By name, after any unread count (the Dashboard's).
  await testId("sidebar")
    .getByRole("link", { name: new RegExp(`^${name}\\s*\\d*$`) })
    .click();
  await page.waitForFunction(
    () => !document.querySelector("main")?.innerText.includes("Loading…"),
    null,
    { timeout: 30_000 },
  );
};
const tab = (name) => testId("market-tabs").getByRole("link", { name }).click();
const header = (table, name) =>
  testId(table)
    .locator("thead")
    .getByRole("button", { name: new RegExp(`^${name}( [▾▴])?$`) });
const scanLeaks = async () => {
  const text = await page.locator("body").innerText();
  for (const n of expected.realNames) if (text.includes(n)) leaks.add(n);
};
/** "€625.1k" → 625100. */
const euros = (text) => {
  const m = text.match(/€([\d.,]+)\s*([km]?)/);
  if (!m) return 0;
  return Math.round(Number(m[1].replace(/,/g, "")) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
};
const idle = () =>
  page.waitForFunction(
    () => !/Playing/.test(document.querySelector('[data-testid="play-button"]')?.textContent ?? ""),
    null,
    { timeout: 300_000 },
  );
const options = async () => {
  if (await testId("play-button").isDisabled()) return [];
  await testId("play-button").click();
  const items = await testId("play-menu").getByRole("button").allInnerTexts();
  await testId("play-button").click(); // close it again
  return items;
};
let sackings = 0;
const takenJobs = [];
async function takeJobIfSacked() {
  if ((await testId("fired-banner").count()) === 0) return;
  sackings++;
  await page.goto(page.url().replace(/(\/l\/\d+).*/, "$1/fired"));
  await testId("job-offers").waitFor({ timeout: 30_000 });
  const club = await testId("job-offers").locator("h3").first().innerText();
  await testId("job-offers").getByRole("button", { name: "Take the job" }).first().click();
  await testId("club-summary").waitFor({ timeout: 30_000 });
  takenJobs.push(club);
  log(`sacked: took the job at ${club}`);
}
async function play(label) {
  if (!(await options()).includes(label)) return false;
  await testId("play-button").click();
  await testId("play-menu").getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(150);
  await idle();
  await takeJobIfSacked();
  return true;
}
const seniors = async () => {
  await go("Transfer Market");
  return Number((await testId("market-summary").innerText()).match(/Seniors (\d+)/)?.[1] ?? 25);
};
const modal = testId("contract-modal");
const closeModal = async () => {
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
};
/** Picks the first length he asks for that you can afford, then Renew / Sign him. */
async function agreeTerms() {
  const radios = modal.locator('[data-testid="contract-asks"] input[type="radio"]:not([disabled])');
  if ((await radios.count()) === 0) return "no affordable terms";
  await radios.first().check();
  const agree = modal.locator('[data-testid="agree-contract"]');
  if (await agree.isDisabled()) {
    const why = modal.locator('[data-testid="contract-blocked"], [data-testid="contract-full"]');
    return (await why.count()) ? why.first().innerText() : "blocked";
  }
  await agree.click();
  await testId("contract-note").waitFor({ timeout: 15_000 });
  return testId("contract-note").innerText();
}
const done = {
  tactics: 0,
  watched: 0,
  liveChanges: 0,
  renewals: 0,
  promotions: 0,
  freeAgents: 0,
  purchases: 0,
  listed: 0,
  loansOut: 0,
  bidsAccepted: 0,
};

// --- Steps (each through the screens) --------------------------------------------------------------
async function setTactics(season) {
  await go("Tactics");
  await testId("tactics-xi").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Auto", exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator("#slider-mentality").focus();
  await page.keyboard.press(season % 2 ? "ArrowRight" : "ArrowLeft");
  await page.waitForTimeout(300);
  if (await testId("save-tactics").isDisabled()) return;
  await testId("save-tactics").click();
  await testId("tactics-message").waitFor({ timeout: 15_000 });
  if (/Saved/.test(await testId("tactics-message").innerText())) done.tactics++;
}

async function setTicketPrice() {
  await go("Finances & Facilities");
  await testId("tickets").waitFor({ timeout: 30_000 });
  if (await testId("save-ticket").isDisabled()) return;
  const fair = euros(
    (await testId("tickets").innerText()).match(/fair price for your club \((€[\d.,]+)\)/)?.[1] ??
      "",
  );
  await page.locator("#ticket-auto").uncheck();
  await page.locator("#ticket-price").fill(String(Math.round(fair * 1.1)));
  await testId("save-ticket").click();
  await testId("tickets").locator('[data-testid="save-note"]').waitFor({ timeout: 15_000 });
}

/** Sets the fees/wages split to 60% wages, so new players' wages fit as well as fees. */
async function balancedSplit() {
  await go("Finances & Facilities");
  await testId("budgets").waitFor({ timeout: 30_000 });
  await page.locator("#wage-share").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  if (await testId("save-split").isDisabled()) return;
  await testId("save-split").click();
  await testId("budgets").locator('[data-testid="save-note"]').waitFor({ timeout: 15_000 });
}

/** Bids for a cheap player at another club, within the transfer budget, and signs him. */
async function buyPlayer() {
  await go("Transfer Market");
  await tab("Search");
  await page.locator("#search-max-age").fill("27");
  await page.locator('select[aria-label="League"]').selectOption({ label: "English second tier" });
  const rows = testId("market-search").locator("tbody tr");
  await rows.first().waitFor({ timeout: 30_000 });
  await header("market-search", "Value").click();
  await header("market-search", "Value").click(); // cheapest first
  for (let i = 0; i < 8; i++) {
    const row = rows.nth(i);
    if ((await row.count()) === 0) break;
    const name = await row.locator("td a").first().innerText();
    await row.getByRole("button", { name: "Bid" }).click();
    await modal.locator('[data-testid="contract-budget"]').waitFor({ timeout: 15_000 });
    const budget = euros(
      (await modal.locator('[data-testid="contract-budget"]').innerText()).match(
        /Transfer budget\s*(€[\d.,]+\s*[km]?)/,
      )?.[1] ?? "",
    );
    if ((await modal.locator('[data-testid="bid-step"]').count()) > 0) {
      const value = Number(await modal.locator("#contract-fee").inputValue());
      const fee = Math.min(budget, Math.round((value * 1.5) / 10_000) * 10_000);
      if (fee < value) {
        log(`no budget for ${name} (budget ${budget}, value ${value})`);
        await closeModal();
        if (budget < 100_000) return;
        continue;
      }
      await modal.locator("#contract-fee").fill(String(fee));
      await modal.locator('[data-testid="make-bid"]').click();
      await testId("contract-note").waitFor({ timeout: 15_000 });
      if ((await modal.getByText(/Fee agreed/).count()) === 0) {
        log(`bid for ${name}: ${await testId("contract-note").innerText()}`);
        await closeModal();
        continue;
      }
    }
    const result = await agreeTerms();
    await closeModal();
    if (/joins your club/.test(result)) {
      done.purchases++;
      log(`bought ${name}`);
      return;
    }
    log(`terms for ${name}: ${result}`);
  }
}

/** Releases the least valuable seniors until at most `max` remain (to make room). */
async function makeRoom(max) {
  let count = await seniors();
  while (count > max) {
    await tab("Your listed players");
    const rows = testId("market-squad").locator("tbody tr");
    await rows.first().waitFor({ timeout: 30_000 });
    await header("market-squad", "Value").click();
    await header("market-squad", "Value").click(); // cheapest first
    const name = await rows.first().locator("td a").first().innerText();
    await rows.first().getByRole("button", { name: "Release" }).click();
    await testId("release-confirm").click();
    await testId("dialog-note").waitFor({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    log(`released ${name} to make room`);
    count = await seniors();
  }
}

async function promoteProspect() {
  await go("Youth Academy");
  const rows = testId("academy").locator("tbody tr");
  if ((await rows.count()) === 0 || (await rows.first().locator("td").count()) < 2) return;
  const button = rows.first().getByRole("button", { name: "Promote" });
  if (await button.isDisabled()) return;
  const name = await rows.first().locator("td a").first().innerText();
  await button.click();
  await testId("academy-note").waitFor({ timeout: 15_000 });
  if (/first professional contract/.test(await testId("academy-note").innerText())) {
    done.promotions++;
    log(`promoted ${name}`);
  }
}

async function signFreeAgent() {
  await go("Free Agents");
  await page.locator("#fa-affordable").check();
  const rows = testId("free-agents").locator("tbody tr");
  await rows.first().waitFor({ timeout: 30_000 });
  if ((await rows.first().locator("td").count()) < 2) return;
  const name = await rows.first().locator("td a").first().innerText();
  await rows.first().getByRole("button", { name: "Negotiate" }).click();
  await modal
    .locator('[data-testid="contract-asks"] tbody tr')
    .first()
    .waitFor({ timeout: 15_000 });
  const result = await agreeTerms();
  if (/joins your club/.test(result)) {
    done.freeAgents++;
    log(`signed free agent ${name}`);
  } else log(`free agent ${name}: ${result}`);
  await closeModal();
}

async function renewExpiring() {
  await go("Squad");
  const row = testId("squad-table")
    .locator("tbody tr", { has: page.locator('.status-badge[aria-label^="Contract expires"]') })
    .first();
  if ((await row.count()) === 0) return;
  const name = await row.locator("td a").first().innerText();
  await row.getByRole("button", { name: "Contract" }).click();
  await modal
    .locator('[data-testid="contract-asks"] tbody tr')
    .first()
    .waitFor({ timeout: 15_000 });
  const result = await agreeTerms();
  if (/signs a new contract/.test(result)) {
    done.renewals++;
    log(`renewed ${name}`);
  } else log(`renewal of ${name}: ${result}`);
  await closeModal();
}

/** Puts squad players on the transfer list at 85% of their value. */
async function listPlayers(count) {
  await go("Transfer Market");
  await tab("Your listed players");
  const rows = testId("market-squad").locator("tbody tr");
  await rows.first().waitFor({ timeout: 30_000 });
  for (let i = 0; i < count; i++) {
    // A player other clubs would want (one of the best): weaker ones draw no bids.
    const row = rows.filter({ hasNot: page.locator(".badge", { hasText: "listed" }) }).nth(1 + i);
    if ((await row.count()) === 0) return;
    await row.getByRole("button", { name: "List" }).click();
    const asking = Number(await page.locator("#list-asking").inputValue());
    await page.locator("#list-asking").fill(String(Math.round((asking * 0.85) / 10_000) * 10_000));
    await testId("list-confirm").click();
    await testId("dialog-note").waitFor({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    done.listed++;
  }
}

/** Offers a bench player (13th to 17th by OVR) on loan to some second-tier clubs. */
async function loanOut() {
  await go("Transfer Market");
  await tab("Your listed players");
  const rows = testId("market-squad").locator("tbody tr");
  await rows.first().waitFor({ timeout: 30_000 });
  for (let i = 12; i < 17; i++) {
    const row = rows.nth(i);
    if ((await row.count()) === 0) return;
    const name = await row.locator("td a").first().innerText();
    for (const index of [22, 28, 34, 40]) {
      await row.getByRole("button", { name: "Loan out" }).click();
      await page.locator("#loan-club").selectOption({ index });
      await page.locator("#loan-share").selectOption("0");
      await testId("loan-confirm").click();
      await testId("dialog-note").waitFor({ timeout: 15_000 });
      const reply = await testId("dialog-note").innerText();
      await page.keyboard.press("Escape");
      if (/on loan until/.test(reply)) {
        done.loansOut++;
        log(`loaned out: ${reply}`);
        return;
      }
    }
  }
}

/** Answers bids for your players in the Dashboard's inbox: accepts the first open one. */
async function answerBids() {
  await go("Dashboard");
  await testId("inbox-list").waitFor({ timeout: 15_000 });
  const bid = testId("inbox-list")
    .locator("article")
    .filter({ has: page.locator(".badge", { hasText: "Open bid" }) })
    .first();
  if ((await bid.count()) === 0) return;
  // Held by the body's id: once answered, the message loses its "Open bid" badge.
  const toggle = bid.locator(".inbox-message-toggle");
  const body = page.locator(`#${await toggle.getAttribute("aria-controls")}`);
  await toggle.click();
  const text = await body.innerText();
  await body.getByRole("button", { name: "Accept" }).click();
  await body.getByText(/^Bid (completed|rejected)$/).waitFor({ timeout: 15_000 });
  done.bidsAccepted++;
  log(`accepted in the inbox: ${text.split(" (")[0]}`);
}

/** Watches the next match: kick off fast, stop at half-time, change things, play to full time. */
async function watchLive() {
  if (!(await play("Watch your next match"))) return;
  await page.waitForFunction(() => location.pathname.endsWith("/live"), null, { timeout: 60_000 });
  await testId("pre-match").waitFor({ timeout: 30_000 });
  // Someone in the saved line-up hurt or banned by now: Auto leaves him out (T, 2026-10-25).
  if ((await testId("kickoff-blocked").count()) > 0) {
    log(`kick-off held: ${(await testId("kickoff-blocked").innerText()).split(". ")[1]}; Auto`);
    await testId("pre-match").getByRole("button", { name: "Auto" }).click();
    await testId("kickoff-blocked").waitFor({ state: "detached" });
  }
  await page.locator("#live-speed").focus();
  await page.keyboard.press("End");
  await testId("live-play").click();
  let title = "";
  for (let i = 0; i < 10 && title !== "Half-time"; i++) {
    await testId("changes").waitFor({ timeout: 120_000 });
    title = await testId("changes-title").innerText();
    if (title !== "Half-time") await testId("resume").click();
  }
  if (title === "Half-time") {
    // On the tactics board: the first substitute onto slot 8, and a touch more attacking.
    const board = testId("changes");
    await board.locator('[data-testid="tactics-xi"] tbody tr').first().waitFor({ timeout: 30_000 });
    const bench = board.locator('[data-testid="tactics-bench"] tbody tr');
    if ((await bench.count()) > 0) {
      await bench.first().click();
      await board.locator('[data-testid="tactics-xi"] tbody tr').nth(8).click();
    }
    await page.locator("#slider-mentality").focus();
    await page.keyboard.press("ArrowRight");
    await testId("apply-changes").click();
    await page
      .waitForFunction(
        () =>
          /Subs [1-9]/.test(document.querySelector('[data-testid="my-team"]')?.textContent ?? ""),
        null,
        { timeout: 15_000 },
      )
      .catch(() => {});
    if (/Subs [1-9]/.test(await testId("my-team").innerText())) done.liveChanges++;
  }
  await testId("live-end").click();
  await testId("live-done").waitFor({ timeout: 120_000 });
  done.watched++;
  log(`watched a match: ${(await testId("live-score").innerText()).replace(/\s/g, "")}`);
  await scanLeaks();
  await go("Dashboard");
}

// --- The career ----------------------------------------------------------------------------------
await page.goto(`${BASE}/new`);
await page.getByRole("button", { name: "English second tier" }).click();
await page.locator('[data-testid="club-choices"] button', { hasText: CLUB }).click();
await page.fill("#new-league-name", "Career");
await page.fill("#new-league-seed", "career");
await testId("start-league").click();
await testId("top-bar").waitFor({ timeout: 60_000 });
const started = Date.now();

for (let season = 1; season <= SEASONS; season++) {
  console.log(
    `\n--- Season ${season}: ${(await testId("game-date").innerText()).replace(/\n/g, " ")}`,
  );
  await setTactics(season);
  await setTicketPrice();
  await balancedSplit();
  await buyPlayer(); // first, while the budget is fresh
  await makeRoom(23);
  await promoteProspect();
  await signFreeAgent();
  await renewExpiring();
  await listPlayers(1);
  await loanOut();
  await scanLeaks();
  // The summer window a week at a time, answering bids for your players.
  for (let week = 0; week < 10 && (await options()).includes("Until the window closes"); week++) {
    await answerBids();
    await play("One week");
  }
  await answerBids();
  await watchLive(); // the next match, after the window
  await play("Until the end of the season");
  await go("History");
  await scanLeaks();
  await play("Proceed to promotion and relegation");
  await play("Advance to preseason");
}
console.log(
  `\n${SEASONS} seasons in ${Math.round((Date.now() - started) / 1000)} s; sacked ${sackings} time(s).`,
);

// --- What the game recorded ------------------------------------------------------------------------
await go("Transactions");
const seasonsShown = await testId("season-picker").locator("option").allInnerTexts();
const records = [];
for (const label of seasonsShown) {
  await testId("season-picker").selectOption({ label });
  await page.waitForTimeout(400);
  await testId("transactions")
    .locator('select[aria-label="Rows per page"]')
    .selectOption({ label: "All rows" })
    .catch(() => {});
  const rows = await testId("transactions")
    .locator("tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) => [...tr.children].map((td) => (td.textContent ?? "").trim())),
    );
  records.push(...rows.filter((r) => r.length > 2));
}
// Only moves involving the user's club(s), by the exact wording of each kind of move.
const clubs = [CLUB, ...takenJobs].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const count = (type, pattern) =>
  records.filter(([, t, text]) => t === type && new RegExp(pattern).test(text)).length;
const recorded = {
  boughtIn: count("Transfer", `moves from .+ to (${clubs})$`),
  soldOut: count("Transfer", `moves from (${clubs}) to `),
  freeAgents: count("Free agent", `signs for (${clubs}) on a free$`),
  loansOut: count("Loan", `on loan from (${clubs})$`),
  renewals: count("Renewal", `renews at (${clubs})$`),
  promotions: count("Promotion", `promoted from (${clubs})'s academy$`),
};
console.log(`\nRecorded for your club: ${JSON.stringify(recorded)}`);
console.log(`Done in the screens: ${JSON.stringify(done)}`);

check(
  `${SEASONS} seasons played through the Play menu`,
  seasonsShown.length >= SEASONS + 1,
  seasonsShown.join(", "),
);
check(
  "signed players: free agents and a transfer in",
  recorded.freeAgents >= 1 && recorded.boughtIn >= 1,
  `${recorded.freeAgents} free, ${recorded.boughtIn} bought`,
);
check(
  "sold a player (an accepted bid went through)",
  recorded.soldOut >= 1,
  `${recorded.soldOut} sold, ${done.bidsAccepted} bids accepted`,
);
check("loaned a player out", recorded.loansOut >= 1, `${recorded.loansOut}`);
check("renewed contracts", recorded.renewals >= 1, `${recorded.renewals}`);
check(
  "promoted academy players",
  recorded.promotions >= 1 && done.promotions >= 1,
  `${recorded.promotions}`,
);
check("set tactics each preseason", done.tactics >= SEASONS, `${done.tactics}`);
check(
  "watched a match live each season and changed it at half-time",
  done.watched >= SEASONS && done.liveChanges >= SEASONS,
  `${done.watched} watched, ${done.liveChanges} changed`,
);
await go("History");
check("History has every finished season", (await testId("history-season").count()) >= SEASONS);
check("no real club names on any page visited", leaks.size === 0, [...leaks].join(", "));
check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(
  failures === 0 ? "\nThe three-season career passes." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
