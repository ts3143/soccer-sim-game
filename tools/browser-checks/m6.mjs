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
  (await rows.locator("td:nth-child(2)").allInnerTexts()).map((t) => t.trim());
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

check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll M6 checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
