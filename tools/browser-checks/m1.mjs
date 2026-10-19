// Headless Chrome check of the M1 inspector against a running server (BASE).
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-m1-"));
let failures = 0;
const errors = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const watch = (page, label) => {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label} console: ${m.text()}`));
};
const saveRows = (page) => page.locator("section.card").first().locator("tbody tr");
const createLeague = async (page, { name, seed, clubValue }) => {
  await page.fill("#league-name", name);
  await page.fill("#league-seed", seed);
  if (clubValue !== undefined) await page.selectOption("#league-club", String(clubValue));
  const started = Date.now();
  await page.getByRole("button", { name: "New league" }).click();
  await page.locator("h2", { hasText: name }).waitFor({ timeout: 60_000 });
  await page.getByText("M1 acceptance checks").waitFor({ timeout: 60_000 });
  return Date.now() - started;
};
const clubRows = (page) => page.locator("tr[role=button]");

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
});
const tab1 = await context.newPage();
watch(tab1, "tab1");
await tab1.goto(`${BASE}/dev`);
await tab1.getByText("No leagues yet").waitFor();
check("fresh browser shows an empty save list", true);

const ms = await createLeague(tab1, { name: "Browser test", seed: "browser", clubValue: 0 });
check("New league creates and opens a save", true, `${(ms / 1000).toFixed(1)} s`);
const checksHeader = await tab1.locator("h3", { hasText: "M1 acceptance checks" }).innerText();
check(
  "all acceptance checks pass in the browser",
  /all \d+ pass/i.test(checksHeader),
  checksHeader,
);

const counts = {};
for (const [label, n] of [
  ["English top flight", 20],
  ["English second tier", 24],
  ["German top flight", 18],
]) {
  await tab1.getByRole("button", { name: label }).click();
  counts[label] = await clubRows(tab1).count();
  check(`${label} tab lists ${n} clubs`, counts[label] === n, `${counts[label]}`);
  const deltas = await tab1.evaluate(() =>
    [...document.querySelectorAll("tr[role=button] td:nth-child(6)")].map((td) => td.textContent),
  );
  check(
    `${label}: every best XI within ±1`,
    deltas.length === n && deltas.every((d) => d.startsWith("✓")),
    deltas.find((d) => !d.startsWith("✓")) ?? "",
  );
}

await tab1.getByRole("button", { name: "English top flight" }).click();
await clubRows(tab1).filter({ hasText: expected.clubName }).click();
await tab1.locator("#squad tbody tr").first().waitFor();
const squadRows = await tab1.locator("#squad tbody tr").count();
const xiNames = await tab1.evaluate(() =>
  [...document.querySelectorAll("#squad tbody tr")]
    .slice(0, 11)
    .map((tr) => tr.children[1].childNodes[0].textContent.trim()),
);
check(
  "clicking a club shows its squad (seniors + academy)",
  squadRows >= 31 && squadRows <= 36,
  `${squadRows} rows`,
);
check(
  "seed 'browser' gives exactly the XI Node generates (determinism across environments)",
  JSON.stringify(xiNames) === JSON.stringify(expected.xiNames),
  xiNames.slice(0, 3).join(", "),
);

const pageText = await tab1.evaluate(() => document.body.innerText);
const leaked = expected.realNames.filter((n) => pageText.includes(n));
check("no real club names on the page", leaked.length === 0, leaked.join(", "));

await tab1.reload();
await tab1.locator("h2", { hasText: "Browser test" }).waitFor({ timeout: 30_000 });
check("the save survives a reload and reopens", (await saveRows(tab1).count()) === 1);

const tab2 = await context.newPage();
watch(tab2, "tab2");
await tab2.goto(`${BASE}/dev`);
await tab2.locator("h2", { hasText: "Browser test" }).waitFor({ timeout: 30_000 });
await createLeague(tab2, { name: "Second", seed: "", clubValue: 44 });
const liveUpdate = await (async () => {
  for (let i = 0; i < 40; i++) {
    if ((await saveRows(tab1).count()) === 2) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
})();
check("a league created in tab 2 appears in tab 1's list live", liveUpdate);
const randomSeed = await tab2.locator("code").first().innerText();
check("an empty seed field gives a random seed", /^[0-9a-f]{8}$/.test(randomSeed), randomSeed);

const second = saveRows(tab1).filter({ hasText: "Second" });
await second.getByRole("button", { name: "Delete" }).click();
await second.getByRole("button", { name: "Delete for good" }).click();
const deleted = await (async () => {
  for (let i = 0; i < 40; i++) {
    if ((await saveRows(tab2).count()) === 1 && (await saveRows(tab1).count()) === 1) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
})();
check("deleting a save (two-step) removes it in both tabs", deleted);

const deep = await context.newPage();
watch(deep, "deep");
const response = await deep.goto(`${BASE}/dev/deep/link`);
await deep.locator("h2", { hasText: "Browser test" }).waitFor({ timeout: 30_000 });
check("deep link loads the app", response?.status() === 200, `HTTP ${response?.status()}`);

await context.close();
check("no page errors or console errors", errors.length === 0, errors.join(" | "));
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
