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

check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll M6 checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
