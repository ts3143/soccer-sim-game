// Headless Chrome check of the M6 management screens against a running server (BASE).
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-m6-"));
let failures = 0;
const errors = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const leakCheck = async (label) => {
  const text = await page.locator("body").innerText();
  const leaked = expected.realNames.filter((n) => text.includes(n));
  check(`no real club names on ${label}`, leaked.length === 0, leaked.join(", "));
};

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(`${BASE}/new`);
await page.getByRole("button", { name: "English second tier" }).click();
await page.locator('[data-testid="club-choices"] button', { hasText: "Lancashire Rovers" }).click();
await page.fill("#new-league-name", "M6 test");
await page.fill("#new-league-seed", "m6");
await page.locator('[data-testid="start-league"]').click();
await page.locator('[data-testid="top-bar"]').waitFor({ timeout: 60_000 });

// --- Chunk 1: Tactics ---------------------------------------------------------------------------
const sidebar = (name) =>
  page.locator('[data-testid="sidebar"]').getByRole("link", { name, exact: true });
const xi = page.locator('[data-testid="tactics-xi"] tbody tr');
const bench = page.locator('[data-testid="tactics-bench"] tbody tr');
const reserves = page.locator('[data-testid="tactics-reserves"] tbody tr');
const nameIn = (row) => row.locator("td:nth-child(2) a").innerText();
const names = async (rows) =>
  (await rows.locator("td:nth-child(2) a").allInnerTexts()).map((t) => t.trim());
const ratings = async () =>
  Object.fromEntries(
    (await page.locator('[data-testid="team-ratings"] tr').allInnerTexts()).map((t) => {
      const [label, value] = t
        .split("\t")
        .map((x) => x.trim())
        .filter((x) => x !== "");
      return [label, Number(value)];
    }),
  );
const settle = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 15_000 });

await sidebar("Tactics").click();
await xi.first().waitFor({ timeout: 30_000 });
const summaryButton = xi.first().getByRole("button", { name: /^Show ratings and stats/ });
await summaryButton.click();
const summary = page.locator(".player-summary-popover:popover-open");
check(
  "the ratings card repeats its row's cosmetic skill tags with explanatory tooltips",
  JSON.stringify(await summary.locator(".player-skill-tag").allTextContents()) ===
    JSON.stringify(await xi.first().locator(".player-skill-tag").allTextContents()) &&
    (await summary
      .locator(".player-skill-tag")
      .evaluateAll((tags) =>
        tags.every(
          (tag) => tag.title.includes("Current:") && tag.title.includes("no gameplay effect"),
        ),
      )),
);

check(
  "the chart icon opens a compact card with all 22 colour-scaled ratings and season stats",
  (await summary.count()) === 1 &&
    (await summary.locator(".summary-ratings .rating-value").count()) === 22 &&
    /Season stats/.test(await summary.innerText()),
);
check(
  "the ratings card stays inside the viewport above the scrolling table",
  await summary.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  }),
);
await page.keyboard.press("Escape");
check(
  "Escape closes the ratings card",
  (await page.locator(".player-summary-popover:popover-open").count()) === 0,
);
// Over the network (production) the flag can still be loading: give it time.
const flag = xi.first().locator("img.nationality-flag");
await flag
  .evaluate(
    (el) =>
      el.complete ||
      new Promise((done) => {
        el.addEventListener("load", done, { once: true });
        el.addEventListener("error", done, { once: true });
        setTimeout(done, 10_000);
      }),
  )
  .catch(() => {});
check(
  "nationality has a flat image column after age",
  await flag.evaluate((el) => el.complete && el.naturalWidth > 0 && el.closest("td").cellIndex > 5),
);
const firstNames = await names(xi);
check(
  "Tactics shows the AI's XI by slot, a bench of 9 and the rest",
  (await xi.count()) === 11 &&
    (await xi.first().locator("td").first().innerText()) === "GK" &&
    firstNames.every((n) => n !== "empty") &&
    (await bench.count()) === 9 &&
    (await reserves.count()) > 0,
);
check(
  "it says no line-up is saved yet, and Save is off",
  (await page.getByText("No line-up saved yet").count()) === 1 &&
    (await page.locator('[data-testid="save-tactics"]').isDisabled()),
);
check("the seven team ratings are shown", Object.keys(await ratings()).length === 7);

const formation = page.locator("#formation");
const was = await formation.inputValue();
await formation.selectOption(was === "4-4-2" ? "4-3-3" : "4-4-2");
await settle((f) => document.querySelector("#formation")?.value !== f, was);
await page.getByText("Unsaved changes").waitFor({ timeout: 15_000 });
const moved = await names(xi);
check(
  "a new formation keeps the same eleven in new slots",
  JSON.stringify([...moved].sort()) === JSON.stringify([...firstNames].sort()) &&
    !(await page.locator('[data-testid="save-tactics"]').isDisabled()),
);

const before = await ratings();
await page.locator("#slider-mentality").focus();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await settle(() =>
  /\(\+2\)/.test(document.querySelector('label[for="slider-mentality"]')?.textContent ?? ""),
);
await settle((a) => {
  const row = [...document.querySelectorAll('[data-testid="team-ratings"] tr')].find((tr) =>
    tr.textContent.startsWith("Attack"),
  );
  return row && Number(row.children[2]?.textContent) > a;
}, before.Attack);
const after = await ratings();
check(
  "an attacking mentality raises Attack and lowers Defence, live",
  after.Attack > before.Attack && after.Defence < before.Defence,
  `Attack ${before.Attack}→${after.Attack}, Defence ${before.Defence}→${after.Defence}`,
);

const reserve = await nameIn(reserves.first());
const striker = await nameIn(xi.nth(10));
await reserves.first().dragTo(xi.nth(10));
await settle(
  (n) =>
    document.querySelectorAll('[data-testid="tactics-xi"] tbody tr')[10]?.textContent.includes(n),
  reserve,
);
check(
  "dragging a reserve onto a slot swaps him in",
  (await names(reserves)).some((n) => n.startsWith(striker)),
  `${reserve} for ${striker}`,
);

const sub = await nameIn(bench.first());
const second = await nameIn(xi.nth(1));
await bench.first().click();
await xi.nth(1).click();
await settle(
  (n) =>
    document.querySelectorAll('[data-testid="tactics-xi"] tbody tr')[1]?.textContent.includes(n),
  sub,
);
check("clicking a sub and then a starter swaps them", (await nameIn(bench.first())) === second);

await xi.nth(2).click();
await page.locator('[data-testid="take-out"]').click();
await settle(() =>
  document
    .querySelectorAll('[data-testid="tactics-xi"] tbody tr')[2]
    ?.textContent.includes("empty"),
);
check(
  "a player can be left out, and the empty slot is flagged",
  /1 slot is empty/.test(await page.locator('[data-testid="tactics-warnings"]').innerText()),
);

await page.getByRole("button", { name: "Auto", exact: true }).click();
await settle(
  () =>
    ![...document.querySelectorAll('[data-testid="tactics-xi"] tbody tr')].some((tr) =>
      tr.textContent.includes("empty"),
    ),
);
check("Auto fills the XI with the AI's pick", true);
await xi.nth(1).click();
await bench.nth(1).click();
await page.waitForTimeout(300);
const chosen = await names(xi);
await page.locator('[data-testid="save-tactics"]').click();
await page.locator('[data-testid="tactics-message"]').waitFor({ timeout: 15_000 });
check(
  "Save keeps the line-up",
  /Saved/.test(await page.locator('[data-testid="tactics-message"]').innerText()) &&
    (await page.locator('[data-testid="save-tactics"]').isDisabled()),
);
await page.reload();
await xi.first().waitFor({ timeout: 30_000 });
check(
  "the saved line-up is there after a reload",
  JSON.stringify(await names(xi)) === JSON.stringify(chosen) &&
    (await page.getByText("No line-up saved yet").count()) === 0 &&
    /\(\+2\)/.test(await page.locator('label[for="slider-mentality"]').innerText()),
);
await leakCheck("Tactics");
await page.setViewportSize({ width: 960, height: 600 });
await summaryButton.click();
await page.waitForTimeout(100);
check(
  "the popover fits a short laptop window",
  await summary.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight;
  }),
);
await page.locator('[data-testid="page-header"]').click();
check(
  "an outside click closes the popover",
  (await page.locator(".player-summary-popover:popover-open").count()) === 0,
);
await page.setViewportSize({ width: 1400, height: 900 });

const picker = page.locator('[data-testid="team-picker"]');
const other = await picker.locator("option", { hasText: "Dorset Cherries" }).getAttribute("value");
await picker.selectOption(other);
await page.waitForFunction((cid) => location.pathname.endsWith(`/tactics/${cid}`), other);
await xi.first().waitFor({ timeout: 30_000 });
check(
  "another club's tactics are the AI's pick, read-only",
  (await page.getByText("The AI's pick for an ordinary match today.").count()) === 1 &&
    (await page.locator('[data-testid="save-tactics"]').count()) === 0 &&
    (await formation.isDisabled()),
);

// --- Chunk 7 (preseason): the ticket price can be set before the first home match --------------
await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Finances & Facilities", exact: true })
  .click();
await page.locator('[data-testid="tickets"]').waitFor({ timeout: 30_000 });
const fairText =
  (await page.locator('[data-testid="tickets"]').innerText()).match(
    /fair price for your club \(€([\d.,]+)\)/,
  )?.[1] ?? "0";
await page.locator("#ticket-auto").uncheck();
const myPrice = Math.round(Number(fairText.replace(/,/g, "")) * 1.2);
await page.locator("#ticket-price").fill(String(myPrice));
await page.locator('[data-testid="save-ticket"]').click();
await page
  .locator('[data-testid="tickets"] [data-testid="save-note"]')
  .waitFor({ timeout: 15_000 });
check(
  "in preseason you set your own ticket price; the table shows crowd and gate per price",
  (await page.locator('[data-testid="tickets"]').innerText()).includes(`Now €${myPrice}`) &&
    (await page.locator('[data-testid="ticket-curve"] tbody tr').count()) >= 6,
  `€${myPrice} (fair €${fairText})`,
);

// --- Chunk 2: Watch live (game side, first screen) -----------------------------------------------
const clockText = () => page.locator('[data-testid="live-clock"]').innerText();
const minuteOf = (text) => Number(text.match(/^(\d+)/)?.[1] ?? 0);
await page.locator('[data-testid="play-button"]').click();
await page
  .locator('[data-testid="play-menu"]')
  .getByRole("button", { name: "Watch your next match" })
  .click();
await page.waitForFunction(() => location.pathname.endsWith("/live"), null, { timeout: 120_000 });
await page.locator('[data-testid="live-scoreboard"]').waitFor({ timeout: 30_000 });
check(
  "Play → Watch your next match plays up to the match day and opens the live match",
  /Lancashire Rovers/.test(await page.locator('[data-testid="live-scoreboard"]').innerText()) &&
    (await clockText()) === "Kick-off" &&
    (await page.locator('[data-testid="live-score"]').innerText()).replace(/\s/g, "") === "0–0",
);
check(
  "while it's live the Play menu waits and the top bar links back to it",
  (await page.locator('[data-testid="play-button"]').isDisabled()) &&
    (await page.locator('[data-testid="live-link"]').count()) === 1,
);
await sidebar("Dashboard").click();
await page.locator('[data-testid="club-summary"]').waitFor({ timeout: 30_000 });
await page.locator('[data-testid="live-link"]').click();
await page.locator('[data-testid="live-scoreboard"]').waitFor({ timeout: 30_000 });
check("the top-bar link goes back to the match", (await clockText()) === "Kick-off");

// --- Chunk 3: before kick-off, and the live screen -------------------------------------------------
const preXi = page.locator('[data-testid="pre-match"] [data-testid="tactics-xi"] tbody tr');
const preReserves = page.locator(
  '[data-testid="pre-match"] [data-testid="tactics-reserves"] tbody tr',
);
check(
  "before kick-off: your line-up for this match and the opponent's XI",
  (await preXi.count()) === 11 &&
    (await page.locator('[data-testid="opponent-xi"] tbody tr').count()) === 11 &&
    /for this match only/.test(await page.locator('[data-testid="pre-match"]').innerText()),
);
const savedXi = await names(preXi);
const newcomer = await nameIn(preReserves.first());
await preReserves.first().dragTo(preXi.nth(10));
await settle(
  (n) =>
    document
      .querySelectorAll('[data-testid="pre-match"] [data-testid="tactics-xi"] tbody tr')[10]
      ?.textContent.includes(n),
  newcomer,
);
await page.locator('[data-testid="use-saved"]').click();
await settle(
  (n) =>
    !document
      .querySelectorAll('[data-testid="pre-match"] [data-testid="tactics-xi"] tbody tr')[10]
      ?.textContent.includes(n),
  newcomer,
);
check(
  "a change applies to the match, and My saved line-up goes back",
  JSON.stringify(await names(preXi)) === JSON.stringify(savedXi),
);
await preReserves.first().dragTo(preXi.nth(10));
await settle(
  (n) =>
    document
      .querySelectorAll('[data-testid="pre-match"] [data-testid="tactics-xi"] tbody tr')[10]
      ?.textContent.includes(n),
  newcomer,
);

const speed = page.locator("#live-speed");
await speed.focus();
await page.keyboard.press("End");
await settle(
  () => document.querySelector('[data-testid="live-speed-label"]')?.textContent === "Very fast",
);
await page.reload();
await page.locator('[data-testid="pre-match"]').waitFor({ timeout: 30_000 });
check(
  "the speed slider and the match's line-up survive a reload",
  (await page.locator('[data-testid="live-speed-label"]').innerText()) === "Very fast" &&
    (await nameIn(preXi.nth(10))) === newcomer,
);
await speed.focus();
await page.keyboard.press("Home");
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await settle(
  () => document.querySelector('[data-testid="live-speed-label"]')?.textContent === "Normal",
);

await page.locator('[data-testid="live-play"]').click();
await page.waitForFunction(
  () =>
    /^(\d+)/.test(document.querySelector('[data-testid="live-clock"]')?.textContent ?? "") &&
    Number(
      document.querySelector('[data-testid="live-clock"]')?.textContent.match(/^(\d+)/)?.[1],
    ) >= 20,
  null,
  { timeout: 60_000 },
);
await page.locator('[data-testid="live-play"]').click(); // pause
const paused = minuteOf(await clockText());
await page.waitForTimeout(800);
const energies = async (team) =>
  (
    await page
      .locator(`[data-testid="${team}"] [data-testid="energy-row"] td:last-child`)
      .allInnerTexts()
  ).map(Number);
const mine = await energies("my-team");
check(
  "the live screen shows both teams' energy, draining as they play, and the newcomer is playing",
  mine.length === 11 &&
    (await energies("their-team")).length === 11 &&
    mine.some((e) => e < 95) &&
    (await page.locator('[data-testid="pre-match"]').count()) === 0 &&
    (await page.locator('[data-testid="my-team"]').innerText()).includes(newcomer),
  `energy ${Math.min(...mine)}–${Math.max(...mine)}`,
);
check(
  "Kick off plays the match with a feed and stats; Pause stops it",
  minuteOf(await clockText()) === paused &&
    (await page.locator('[data-testid="live-feed"] li').count()) > 3 &&
    /Possession/.test(await page.locator('[data-testid="live-stats"]').innerText()),
  `paused at ${paused}'`,
);
await page.reload();
await page.locator('[data-testid="live-scoreboard"]').waitFor({ timeout: 30_000 });
const resumed = minuteOf(await clockText());
check(
  "after a reload the match resumes from where it was saved, not from kick-off",
  resumed >= paused - 6 && resumed <= paused && resumed > 1,
  `${resumed}' (paused at ${paused}')`,
);

// --- Chunk 4: changes during the match ----------------------------------------------------------
const changes = page.locator('[data-testid="changes"]');
const myCard = () => page.locator('[data-testid="my-team"]').innerText();
await changes.waitFor({ timeout: 15_000 });
check(
  "paused mid-match, the changes screen says a substitution now uses a window",
  (await page.locator('[data-testid="changes-title"]').innerText()) === "Paused" &&
    /use 1 of your 3 remaining windows/.test(await changes.innerText()),
);
const subSelect = (i) =>
  page.locator('[data-testid="changes-subs"] tbody tr').nth(i).locator("select");
const firstOption = async (i) =>
  (await subSelect(i).locator("option").nth(1).getAttribute("value")) ?? "";
await subSelect(9).selectOption(await firstOption(9));
await page.locator('[data-testid="apply-changes"]').click();
await settle(() =>
  /Subs 1\/5 · windows 1\/3/.test(
    document.querySelector('[data-testid="my-team"]')?.textContent ?? "",
  ),
);
check(
  "a substitution during play comes on and uses a window",
  (await page.locator('[data-testid="live-feed"] .badge', { hasText: "Sub" }).count()) >= 1,
);
const formationNow = await page.locator("#live-formation").inputValue();
const nextFormation = formationNow === "4-4-2" ? "4-3-3" : "4-4-2";
await page.locator("#live-formation").selectOption(nextFormation);
await page.locator("#live-slider-mentality").focus();
await page.keyboard.press("ArrowRight");
await page.locator('[data-testid="apply-changes"]').click();
await settle(
  (f) => document.querySelector('[data-testid="my-team"] h2')?.textContent.includes(f),
  nextFormation,
);
check("the formation and sliders change mid-match", (await myCard()).includes(nextFormation));

// Play on to half-time: it stops there by itself (and for any injury or red card on the way).
let title = "";
for (let i = 0; i < 8 && title !== "Half-time"; i++) {
  await page.locator('[data-testid="resume"]').click();
  await changes.waitFor({ timeout: 90_000 });
  title = await page.locator('[data-testid="changes-title"]').innerText();
}
check(
  "play stops by itself at half-time with the changes screen",
  title === "Half-time" && (await clockText()) === "Half-time",
  title,
);
check(
  "at half-time substitutions don't use a window",
  /don't use a window/.test(await changes.innerText()),
);
const used = Number((await myCard()).match(/Subs (\d)\/5/)?.[1] ?? 0);
await subSelect(4).selectOption(await firstOption(4));
await page.locator('[data-testid="apply-changes"]').click();
await settle(
  (n) =>
    new RegExp(`Subs ${n}/5 · windows 1/3`).test(
      document.querySelector('[data-testid="my-team"]')?.textContent ?? "",
    ),
  used + 1,
);
check("a half-time substitution is free", true, `subs ${used + 1}/5, windows 1/3`);

await page.locator('[data-testid="live-end"]').click();
await page.locator('[data-testid="live-done"]').waitFor({ timeout: 60_000 });
const finalScore = (await page.locator('[data-testid="live-score"]').innerText()).replace(
  /\s/g,
  "",
);
const goals = finalScore.split("–").map(Number);
const scorerCount = async (side) => {
  const text = (await page.locator(`[data-testid="scorers-${side}"]`).innerText()).trim();
  return text === "" ? 0 : text.split(", ").length;
};
check(
  "the scoreboard lists the scorers",
  (await scorerCount(0)) === goals[0] && (await scorerCount(1)) === goals[1],
  finalScore,
);
check(
  "To full time finishes the match and saves the day",
  (await clockText()) === "Full time" &&
    (await page.locator('[data-testid="live-link"]').count()) === 0,
  finalScore,
);
await page.locator('[data-testid="live-done"]').getByRole("link", { name: "Box score" }).click();
await page.locator('[data-testid="box-score"]').waitFor({ timeout: 30_000 });
const box = await page.locator('[data-testid="box-score"]').innerText();
check(
  "the watched match has its box score",
  /Lancashire Rovers/.test(box) && /Possession/.test(box),
);
await page.locator('[data-testid="play-button"]').click();
check(
  "the Play menu offers its options again",
  /Until next match/.test(await page.locator('[data-testid="play-menu"]').innerText()),
);
await page.keyboard.press("Escape");
await leakCheck("the live match");

// --- Chunk 5: contract talks and Free Agents --------------------------------------------------------
const modal = page.locator('[data-testid="contract-modal"]');
const note = page.locator('[data-testid="contract-note"]');
const pickTerms = async () => {
  const radios = modal.locator('[data-testid="contract-asks"] input[type="radio"]:not([disabled])');
  await radios.first().check();
};
await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Free Agents", exact: true })
  .click();
const faRows = page.locator('[data-testid="free-agents"] tbody tr');
await faRows.first().waitFor({ timeout: 30_000 });
check(
  "Free Agents lists unsigned players with their asks, your wage room and squad size",
  (await faRows.count()) > 10 &&
    /Wage room[\s\S]*Seniors \d+\/25/.test(
      await page.locator('[data-testid="free-agents-summary"]').innerText(),
    ),
);
await page.locator("#fa-affordable").check();
await faRows.first().waitFor();
const signing = await faRows.first().locator("td").first().innerText();
await faRows.first().getByRole("button", { name: "Negotiate" }).click();
await modal.waitFor({ timeout: 15_000 });
await modal.locator('[data-testid="contract-asks"] tbody tr').first().waitFor({ timeout: 15_000 });
check(
  "Negotiate opens the contract window: his asks per length, mood and your budget",
  /Free agent talks/.test(await modal.locator("h2").first().innerText()) &&
    (await modal.locator('[data-testid="contract-asks"] tbody tr').count()) === 5 &&
    /Wage room/.test(await modal.locator('[data-testid="contract-budget"]').innerText()),
);
await pickTerms();
await modal.locator('[data-testid="agree-contract"]').click();
await note.waitFor({ timeout: 15_000 });
check(
  "signing a free agent brings him to your club",
  /joins your club/.test(await note.innerText()),
  await note.innerText(),
);
await modal.getByRole("button", { name: "Done" }).click();
await page.waitForFunction(
  (n) =>
    ![...document.querySelectorAll('[data-testid="free-agents"] tbody tr td:first-child')].some(
      (td) => td.textContent === n,
    ),
  signing,
  { timeout: 15_000 },
);
check("he is no longer a free agent", true, signing);

await sidebar("Squad").click();
const squadRows = page.locator('[data-testid="squad-table"] tbody tr');
await squadRows.first().waitFor({ timeout: 30_000 });
check(
  "he is in your squad",
  (await page.locator('[data-testid="squad-table"]').innerText()).includes(signing),
);
const renewing = squadRows.nth(2);
const renewName = await renewing.locator("td:nth-child(2) a").innerText();
await renewing.getByRole("button", { name: "Contract" }).click();
await modal.locator('[data-testid="contract-asks"] tbody tr').first().waitFor({ timeout: 15_000 });
await pickTerms();
await modal.locator('[data-testid="agree-contract"]').click();
await note.waitFor({ timeout: 15_000 });
check(
  "a player of yours renews from the Squad page",
  /signs a new contract/.test(await note.innerText()),
  `${renewName}: ${await note.innerText()}`,
);
await modal.getByRole("button", { name: "Done" }).click();

const dorset = await picker.locator("option", { hasText: "Dorset Cherries" }).getAttribute("value");
await picker.selectOption(dorset);
await page.waitForFunction((cid) => location.pathname.endsWith(`/squad/${cid}`), dorset);
await squadRows.first().waitFor({ timeout: 30_000 });
const valueHead = page.locator('[data-testid="squad-table"] thead th', { hasText: "Value" });
await valueHead.click();
await valueHead.click(); // cheapest first
const target = await squadRows.first().locator("td:nth-child(2) a").innerText();
await squadRows.first().getByRole("button", { name: "Bid" }).click();
await modal.locator('[data-testid="bid-step"]').waitFor({ timeout: 15_000 });
const value = Number(await modal.locator("#contract-fee").inputValue());
await modal.locator("#contract-fee").fill(String(Math.max(10_000, Math.round(value * 0.3))));
await modal.locator('[data-testid="make-bid"]').click();
await note.waitFor({ timeout: 15_000 });
const lowball = await note.innerText();
check("a lowball bid is turned down or countered", /reject|want/.test(lowball), lowball);
await modal.locator("#contract-fee").fill(String(Math.round(value * 1.6)));
await modal.locator('[data-testid="make-bid"]').click();
await modal.getByText(/Fee agreed/).waitFor({ timeout: 15_000 });
check(
  "a fair bid agrees the fee, and personal terms follow",
  (await modal.locator('[data-testid="bid-step"]').count()) === 0,
);
const fullSquad = await modal.locator('[data-testid="contract-full"]').count();
let terms = fullSquad ? await modal.locator('[data-testid="contract-full"]').innerText() : "";
if (!fullSquad) {
  await pickTerms();
  await modal.locator('[data-testid="agree-contract"]').click();
  await note.waitFor({ timeout: 15_000 });
  terms = await note.innerText();
}
check(
  "personal terms complete the transfer, or the window says the squad is full first",
  fullSquad
    ? (await modal.locator('[data-testid="agree-contract"]').isDisabled()) &&
        /squad is full/.test(terms)
    : /joins your club/.test(terms),
  terms,
);
await page.keyboard.press("Escape");
await modal.waitFor({ state: "detached", timeout: 5_000 });

// --- Chunk 6: Transfer Market, listing, releasing, loans ------------------------------------------
const dialogNote = page.locator('[data-testid="dialog-note"]');
const marketTab = (name) => page.locator('[data-testid="market-tabs"]').getByRole("link", { name });
await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Transfer Market", exact: true })
  .click();
const searchRows = page.locator('[data-testid="market-search"] tbody tr');
await searchRows.first().waitFor({ timeout: 30_000 });
check(
  "Transfer Market opens on Search: other clubs' players with values and wages, and your budget",
  (await searchRows.count()) === 25 &&
    /Transfer budget[\s\S]*Wage room[\s\S]*Seniors/.test(
      await page.locator('[data-testid="market-summary"]').innerText(),
    ),
);
await page.locator('select[aria-label="Position"]').selectOption("ST");
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="market-search"] tbody tr td:nth-child(3)')].every(
      (td) => td.textContent === "ST",
    ) && document.querySelectorAll('[data-testid="market-search"] tbody tr').length > 0,
  null,
  { timeout: 15_000 },
);
check("the search filters by position", true);

await marketTab("Your listed players").click();
const marketSquad = page.locator('[data-testid="market-squad"] tbody tr');
await marketSquad.first().waitFor({ timeout: 30_000 });
const listing = await marketSquad.nth(1).locator("td a").first().innerText();
await marketSquad.nth(1).getByRole("button", { name: "List" }).click();
await page.locator('[data-testid="list-confirm"]').click();
await dialogNote.waitFor({ timeout: 15_000 });
await page.keyboard.press("Escape");
await page.waitForFunction(
  (n) => document.querySelector('[data-testid="listed-players"]')?.textContent.includes(n),
  listing,
  { timeout: 15_000 },
);
check("listing a player puts him on your transfer list at a price", true, listing);

const seniorsBefore = Number(
  (await page.locator('[data-testid="market-summary"]').innerText()).match(/Seniors (\d+)/)?.[1],
);
const leaving = marketSquad.last();
const leaver = await leaving.locator("td a").first().innerText();
await leaving.getByRole("button", { name: "Release" }).click();
await page.locator('[data-testid="release-dialog"]').waitFor();
check(
  "releasing says what it still costs",
  /keep paying[\s\S]*saves no money/.test(
    await page.locator('[data-testid="release-dialog"]').innerText(),
  ),
);
await page.locator('[data-testid="release-confirm"]').click();
await dialogNote.waitFor({ timeout: 15_000 });
await page.keyboard.press("Escape");
await page.locator('[data-testid="released"]').waitFor({ timeout: 15_000 });
const seniorsAfter = Number(
  (await page.locator('[data-testid="market-summary"]').innerText()).match(/Seniors (\d+)/)?.[1],
);
check(
  "a released player leaves and is listed as still paid",
  seniorsAfter === seniorsBefore - 1 &&
    (await page.locator('[data-testid="released"]').innerText()).includes(leaver) &&
    /Owed to released players/.test(
      await page.locator('[data-testid="market-summary"]').innerText(),
    ),
  `${leaver}, seniors ${seniorsBefore} → ${seniorsAfter}`,
);

// With a place free, the transfer agreed in the window goes through.
await sidebar("Squad").click();
await squadRows.first().waitFor({ timeout: 30_000 });
await picker.selectOption(dorset);
await page.waitForFunction((cid) => location.pathname.endsWith(`/squad/${cid}`), dorset);
await page
  .locator('[data-testid="squad-table"] tbody tr', { hasText: target })
  .getByRole("button", { name: "Bid" })
  .click();
await modal.getByText(/Fee agreed/).waitFor({ timeout: 15_000 });
await pickTerms();
await modal.locator('[data-testid="agree-contract"]').click();
await note.waitFor({ timeout: 15_000 });
check(
  "the agreed transfer completes once there is room",
  /joins your club/.test(await note.innerText()),
  await note.innerText(),
);
await page.keyboard.press("Escape");

await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Transfer Market", exact: true })
  .click();
await marketTab("Your listed players").click();
await marketSquad.first().waitFor({ timeout: 30_000 });
const youngest = marketSquad.filter({ hasNot: page.locator(".badge") }).last();
await youngest.getByRole("button", { name: "Loan out" }).click();
const loanClub = page.locator("#loan-club");
await loanClub.selectOption({ index: 5 });
await page.locator('[data-testid="loan-confirm"]').click();
await dialogNote.waitFor({ timeout: 15_000 });
const loanReply = await dialogNote.innerText();
check("a loan out gets an answer", loanReply.length > 10, loanReply);
await page.keyboard.press("Escape");
await marketTab("Loans").click();
await page.locator('[data-testid="loans-out"]').waitFor({ timeout: 15_000 });
check(
  "the Loans tab lists loans out and in",
  (await page.locator('[data-testid="loans-in"]').count()) === 1,
);

// A week of the window: AI clubs bid, the listed player draws bids near his price.
await page.locator('[data-testid="play-button"]').click();
await page.locator('[data-testid="play-menu"]').getByRole("button", { name: "One week" }).click();
await page.waitForFunction(
  () => !document.querySelector('[data-testid="play-button"]')?.disabled,
  null,
  { timeout: 120_000 },
);
await marketTab(/Incoming offers/).click();
await page.locator('[data-testid="all-offers"]').waitFor({ timeout: 15_000 });
const openOffers = page.locator('[data-testid="open-offers"] tbody tr');
if ((await openOffers.count()) > 0) {
  const n = await openOffers.count();
  await openOffers.first().getByRole("button", { name: "Reject" }).click();
  await page.waitForFunction(
    (k) => document.querySelectorAll('[data-testid="open-offers"] tbody tr').length < k,
    n,
    { timeout: 15_000 },
  );
  check(
    "an incoming bid can be rejected",
    /rejected/.test(await page.locator('[data-testid="all-offers"]').innerText()),
  );
} else {
  check(
    "Incoming offers says when there are no open bids",
    (await page.locator('[data-testid="no-offers"]').count()) === 1,
  );
}
await leakCheck("the Transfer Market");

await page.locator('[data-testid="play-button"]').click();
await page
  .locator('[data-testid="play-menu"]')
  .getByRole("button", { name: "Until the window closes" })
  .click();
await page.waitForFunction(
  () => /31 Aug 2026/.test(document.querySelector('[data-testid="game-date"]')?.textContent ?? ""),
  null,
  { timeout: 120_000 },
);
await page.locator('[data-testid="play-button"]').click();
await page.locator('[data-testid="play-menu"]').getByRole("button", { name: "One week" }).click();
await page.waitForFunction(
  () =>
    !/31 Aug 2026/.test(document.querySelector('[data-testid="game-date"]')?.textContent ?? "") &&
    !document.querySelector('[data-testid="play-button"]')?.disabled,
  null,
  { timeout: 120_000 },
);
await sidebar("Squad").click();
await squadRows.first().waitFor({ timeout: 30_000 });
await squadRows.nth(3).getByRole("button", { name: "Contract" }).click();
await modal.locator('[data-testid="contract-blocked"]').waitFor({ timeout: 15_000 });
check(
  "outside a window renewals wait, and the window says so",
  /window is closed/.test(await modal.locator('[data-testid="contract-blocked"]').innerText()) &&
    (await modal.locator('[data-testid="agree-contract"]').isDisabled()),
);
await modal.getByRole("button", { name: "Walk away" }).click();
await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Free Agents", exact: true })
  .click();
await faRows.first().waitFor({ timeout: 30_000 });
await faRows.first().locator("td a").click();
await page.locator('[data-testid="profile-talks"]').waitFor({ timeout: 30_000 });
check(
  "a free agent's profile offers a contract",
  (await page.locator('[data-testid="profile-talks"]').innerText()) === "Offer a contract",
);
await page.locator('[data-testid="profile-talks"]').click();
await modal.locator('[data-testid="contract-asks"] tbody tr').first().waitFor({ timeout: 15_000 });
check(
  "free agents can still be signed outside a window",
  (await modal.locator('[data-testid="contract-blocked"]').count()) === 0 ||
    !/window/.test(await modal.locator('[data-testid="contract-blocked"]').innerText()),
);
await page.keyboard.press("Escape");
await leakCheck("the contract talks");

// --- Chunk 7: Youth Academy, Finances & Facilities ------------------------------------------------
await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Youth Academy", exact: true })
  .click();
const academyRows = page.locator('[data-testid="academy"] tbody tr');
await academyRows.first().waitFor({ timeout: 30_000 });
check("Youth Academy lists your prospects, best potential first", (await academyRows.count()) >= 3);
const promoteButton = academyRows.first().getByRole("button", { name: "Promote" });
const squadFull = /Seniors 25\/25/.test(
  await page.locator('[data-testid="academy-summary"]').innerText(),
);
if (squadFull) {
  check("with a full squad, promotion waits", await promoteButton.isDisabled());
} else {
  const prospect = await academyRows.first().locator("td a").first().innerText();
  await promoteButton.click();
  await page.locator('[data-testid="academy-note"]').waitFor({ timeout: 15_000 });
  check(
    "promoting gives a prospect his first professional contract",
    /first professional contract/.test(
      await page.locator('[data-testid="academy-note"]').innerText(),
    ),
    prospect,
  );
}
const leaverRow = academyRows.last();
const youth = await leaverRow.locator("td a").first().innerText();
await leaverRow.getByRole("button", { name: "Release" }).click();
await leaverRow.getByRole("button", { name: "Confirm release" }).click();
await page.waitForFunction(
  (n) =>
    /leaves the academy/.test(
      document.querySelector('[data-testid="academy-note"]')?.textContent ?? "",
    ) &&
    ![...document.querySelectorAll('[data-testid="academy"] tbody tr')].some((tr) =>
      tr.textContent.includes(n),
    ),
  youth,
  { timeout: 15_000 },
);
check("releasing asks to confirm, then he leaves the academy", true, youth);

await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Finances & Facilities", exact: true })
  .click();
await page.locator('[data-testid="books"]').waitFor({ timeout: 30_000 });
const books = await page.locator('[data-testid="books"]').innerText();
check(
  "the books: cash, the season's income and spending, cash over the seasons",
  /Gate receipts/.test(books) &&
    /Wages/.test(books) &&
    (await page.locator('[data-testid="books"] svg circle').count()) >= 1,
);
check(
  "the FFP gauge shows squad cost against the limit",
  /limit 70%/.test(await page.locator('[data-testid="ffp"]').innerText()),
);
check(
  "after a home match the ticket price is fixed for the season",
  (await page.locator('[data-testid="ticket-locked"]').count()) === 1 &&
    (await page.locator('[data-testid="save-ticket"]').isDisabled()) &&
    (await page.locator('[data-testid="tickets"]').innerText()).includes(`Now €${myPrice}`),
);
const coachingLabel = () => page.locator('label[for="dial-coaching"]').innerText();
const coachingBefore = Number((await coachingLabel()).match(/(\d+)$/)?.[1]);
await page.locator("#dial-coaching").focus();
for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
await page.locator('[data-testid="save-dials"]').click();
await page.locator('[data-testid="dials"] [data-testid="save-note"]').waitFor({ timeout: 15_000 });
await page.reload();
await page.locator('[data-testid="dials"]').waitFor({ timeout: 30_000 });
check(
  "budget dials save and stay",
  Number((await coachingLabel()).match(/(\d+)$/)?.[1]) === Math.min(100, coachingBefore + 10),
  `${coachingBefore} → ${await coachingLabel()}`,
);
const roomBefore = (await page.locator('[data-testid="budgets"]').innerText()).match(
  /wage room\s+(€[\d.,]+[km]?)/,
)?.[1];
await page.locator("#wage-share").focus();
await page.keyboard.press("End");
await page.locator('[data-testid="save-split"]').click();
await page
  .locator('[data-testid="budgets"] [data-testid="save-note"]')
  .waitFor({ timeout: 15_000 });
await page.waitForFunction(
  (r) =>
    document
      .querySelector('[data-testid="budgets"]')
      ?.textContent.match(/wage room\s+(€[\d.,]+[km]?)/)?.[1] !== r,
  roomBefore,
  { timeout: 15_000 },
);
check(
  "moving the split toward wages changes the wage room",
  true,
  `${roomBefore} → ${(await page.locator('[data-testid="budgets"]').innerText()).match(/wage room\s+(€[\d.,]+[km]?)/)?.[1]}`,
);
await leakCheck("the club pages");

// --- Chunk 8: next-match buttons, the fired page, Settings, the full sidebar -----------------------
check(
  "every sidebar page is built (nothing greyed out)",
  (await page.locator('[data-testid="sidebar"] .badge', { hasText: "M6" }).count()) === 0 &&
    (await page.locator('[data-testid="sidebar"] a', { hasText: "Settings" }).count()) === 1,
);
await sidebar("Dashboard").click();
const nextActions = page.locator('[data-testid="next-match"] [data-testid="next-match-actions"]');
await nextActions.waitFor({ timeout: 30_000 });
const dateBefore = await page.locator('[data-testid="game-date"]').innerText();
await nextActions.getByRole("button", { name: "Simulate it" }).click();
await page.waitForFunction(
  (d) =>
    document.querySelector('[data-testid="game-date"]')?.textContent !== d &&
    !document.querySelector('[data-testid="play-button"]')?.disabled,
  dateBefore,
  { timeout: 120_000 },
);
check(
  "the Dashboard's next match can be simulated",
  true,
  (await page.locator('[data-testid="game-date"]').innerText()).split("\n")[0],
);
await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Game Log", exact: true })
  .click();
await page.locator('[data-testid="next-fixture"]').waitFor({ timeout: 30_000 });
await page
  .locator('[data-testid="next-fixture"]')
  .getByRole("button", { name: "Watch live" })
  .click();
await page.waitForFunction(() => location.pathname.endsWith("/live"), null, { timeout: 120_000 });
await page.locator('[data-testid="live-scoreboard"]').waitFor({ timeout: 30_000 });
check("the Game Log's next match can be watched live", (await clockText()) === "Kick-off");
await page.locator('[data-testid="pre-match"]').waitFor({ timeout: 15_000 });
await page.locator('[data-testid="live-play"]').click();
await page.waitForFunction(
  () => document.querySelector('[data-testid="live-clock"]')?.textContent !== "Kick-off",
  null,
  { timeout: 30_000 },
);
await page.locator('[data-testid="live-end"]').click();
await page.locator('[data-testid="live-done"]').waitFor({ timeout: 60_000 });

await page.goto(page.url().replace(/\/live$/, "/fired"));
await page.getByText("You're in a job").waitFor({ timeout: 30_000 });
check("the You're fired page says so when you still have a job", true);

await page
  .locator('[data-testid="sidebar"]')
  .getByRole("link", { name: "Settings", exact: true })
  .click();
await page.locator('[data-testid="settings"]').waitFor({ timeout: 30_000 });
await page.locator("#league-name").fill("M6 renamed");
await page.locator('[data-testid="rename"]').click();
await page.locator('[data-testid="settings-note"]').waitFor({ timeout: 15_000 });
await page.waitForFunction(
  () => document.querySelector('[data-testid="top-bar"]')?.textContent.includes("M6 renamed"),
  null,
  { timeout: 15_000 },
);
check("Settings renames the save (the top bar follows)", true);
await leakCheck("Settings");
await page.locator('[data-testid="delete-league"]').click();
await page.locator('[data-testid="delete-confirm"]').click();
await page.locator('[data-testid="no-leagues"]').waitFor({ timeout: 30_000 });
check(
  "Settings deletes the league after a confirm, back to Manage Leagues",
  new URL(page.url()).pathname === "/",
);

check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll M6 checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
