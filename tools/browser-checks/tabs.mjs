// M7 bug bash II: two tabs on one game, the fallback (one-tab) worker, reloads in the middle
// of an action, long names, and errors in plain words.
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-tabs-"));
let failures = 0;
const errors = [];
const leaks = new Set();
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1400, height: 900 },
});
const open = async () => {
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return p;
};
const id = (p, testId) => p.locator(`[data-testid="${testId}"]`);
const scan = async (p) => {
  const text = await p.locator("body").innerText();
  for (const n of expected.realNames) if (text.includes(n)) leaks.add(n);
};
const topDate = (p) => id(p, "game-date").innerText();
const playText = (p) => id(p, "play-button").innerText();
/** Opens a Play option; resolves once it has been clicked (not when it ends). */
async function startPlay(p, label) {
  await id(p, "play-button").click();
  await id(p, "play-menu").getByRole("button", { name: label, exact: true }).click();
}
const idle = (p) =>
  p.waitForFunction(
    () => {
      const b = document.querySelector('[data-testid="play-button"]');
      return b && !/Playing/.test(b.textContent ?? "");
    },
    null,
    { timeout: 300_000 },
  );
async function play(p, label) {
  await startPlay(p, label);
  await p.waitForTimeout(100);
  await idle(p);
}
async function newLeague(p, name, seed, nth = 0) {
  await p.goto(`${BASE}/new`);
  const cards = id(p, "club-choices").locator("button");
  await cards.first().waitFor({ timeout: 30_000 });
  await cards.nth(nth).click();
  await p.fill("#new-league-name", name);
  await p.fill("#new-league-seed", seed);
  await id(p, "start-league").click();
  await id(p, "top-bar").waitFor({ timeout: 60_000 });
  return Number(p.url().match(/\/l\/(\d+)/)?.[1]);
}

// --- Two tabs on one league --------------------------------------------------------------------------
const a = await open();
const lid = await newLeague(a, "Tabs", "tabs");
const b = await open();
const squadPath = `${BASE}/l/${lid}/squad`;
await b.goto(squadPath);
const squadRows = (p) => id(p, "squad-table").locator("tbody tr").count();
await id(b, "squad-table").waitFor({ timeout: 30_000 });
const before = await squadRows(b);

// A signs a free agent: B's squad page grows without a reload.
await a.goto(`${BASE}/l/${lid}/free-agents`);
await a.locator("#fa-affordable").check();
const faRow = id(a, "free-agents").locator("tbody tr").first();
await faRow.waitFor({ timeout: 30_000 });
await faRow.getByRole("button", { name: "Negotiate" }).click();
const modal = id(a, "contract-modal");
await modal.locator('[data-testid="contract-asks"] tbody tr').first().waitFor({ timeout: 15_000 });
await modal
  .locator('[data-testid="contract-asks"] input[type="radio"]:not([disabled])')
  .first()
  .check();
await modal.locator('[data-testid="agree-contract"]').click();
await modal.locator('[data-testid="contract-note"]').waitFor({ timeout: 15_000 });
await modal.getByRole("button", { name: "Done" }).click();
const grew = await b
  .waitForFunction(
    (n) => document.querySelectorAll('[data-testid="squad-table"] tbody tr').length === n + 1,
    before,
    { timeout: 15_000 },
  )
  .then(() => true)
  .catch(() => false);
check(
  "a signing in one tab shows in the other tab's squad, without a reload",
  grew,
  `${before} → ${await squadRows(b)}`,
);

// A plays to the end of the season: B shows "Playing…" (and can't start another), then the new date.
const dateBefore = await topDate(b);
await startPlay(a, "Until the end of the season");
const sawPlaying = await b
  .waitForFunction(
    () => /Playing/.test(document.querySelector('[data-testid="play-button"]')?.textContent ?? ""),
    null,
    { timeout: 10_000 },
  )
  .then(() => true)
  .catch(() => false);
const bDisabled = await id(b, "play-button").isDisabled();
check(
  "while one tab plays, the other shows Playing… and can't start anything",
  sawPlaying && bDisabled,
);
await idle(a);
await idle(b);
const moved = await b
  .waitForFunction(
    (d) => document.querySelector('[data-testid="game-date"]')?.textContent !== d,
    dateBefore,
    { timeout: 15_000 },
  )
  .then(() => true)
  .catch(() => false);
check(
  "afterwards the other tab shows the new date and phase",
  moved && /End of season/.test(await topDate(b)),
  (await topDate(b)).replace(/\s+/g, " "),
);

// --- Two leagues in two tabs -------------------------------------------------------------------------
// B starts a second league: A, on the first, stops and says why.
const lid2 = await newLeague(b, "Tabs two", "tabs-two", 1);
await id(a, "league-elsewhere")
  .waitFor({ timeout: 15_000 })
  .catch(() => {});
check(
  "when another tab opens a different league, this tab stops and says why",
  (await id(a, "league-elsewhere").count()) === 1 &&
    /one league open at a time/.test(await id(a, "league-elsewhere").innerText()),
);
await a.getByRole("button", { name: "Open this league here" }).click();
await id(a, "play-button").waitFor({ timeout: 30_000 });
await id(b, "league-elsewhere")
  .waitFor({ timeout: 15_000 })
  .catch(() => {});
check(
  "Open this league here brings it back, and the other tab now stops",
  (await id(a, "league-elsewhere").count()) === 0 &&
    (await id(b, "league-elsewhere").count()) === 1,
);

// A starts the rollover of league 1 and B opens league 2 at once: the rollover finishes and is saved.
await play(a, "Proceed to promotion and relegation");
await startPlay(a, "Advance to preseason");
await b.getByRole("button", { name: "Open this league here" }).click();
await id(b, "play-button").waitFor({ timeout: 60_000 });
await id(a, "league-elsewhere")
  .waitFor({ timeout: 60_000 })
  .catch(() => {});
await a.getByRole("button", { name: "Open this league here" }).click();
await id(a, "play-button").waitFor({ timeout: 60_000 });
await idle(a);
check(
  "a rollover under way finishes and is saved when another tab opens a different league",
  /1 Jul 2027/.test(await topDate(a)) && /Preseason/.test(await topDate(a)),
  (await topDate(a)).replace(/\s+/g, " "),
);

// A deletes league 2 while B shows it.
await b.goto(`${BASE}/l/${lid2}`);
await id(b, "play-button").waitFor({ timeout: 60_000 });
await a.goto(`${BASE}/l/${lid2}/settings`);
await id(a, "delete-league").click();
await id(a, "delete-confirm").click();
await id(a, "league-list").waitFor({ timeout: 30_000 });
await id(b, "league-deleted")
  .waitFor({ timeout: 15_000 })
  .catch(() => {});
check(
  "a league deleted in one tab says so in the other",
  (await id(b, "league-deleted").count()) === 1,
);
await b.close();

// --- Reloads in the middle of an action (one tab) ----------------------------------------------------
await a.goto(`${BASE}/l/${lid}`);
await id(a, "play-button").waitFor({ timeout: 60_000 });
const dateAt = await topDate(a);
await startPlay(a, "Until the end of the season");
await pause(700);
await a.reload();
await id(a, "play-button").waitFor({ timeout: 60_000 });
await idle(a);
const afterReload = await topDate(a);
check(
  "a reload during a season leaves the game where it was, or at the end: never half-played",
  afterReload === dateAt || /End of season/.test(afterReload),
  `${dateAt.replace(/\s+/g, " ")} → ${afterReload.replace(/\s+/g, " ")}`,
);
if (!/End of season/.test(afterReload)) await play(a, "Until the end of the season");
await play(a, "Proceed to promotion and relegation");
await startPlay(a, "Advance to preseason");
await pause(300);
await a.reload();
await id(a, "play-button").waitFor({ timeout: 60_000 });
await idle(a);
const afterRollover = await topDate(a);
if (/End of season/.test(afterRollover)) await play(a, "Advance to preseason");
await play(a, "One week");
check(
  "a reload during the rollover leaves the old season or the new one, and play goes on",
  /2028/.test(await topDate(a)) && /Preseason|Regular season/.test(await topDate(a)),
  `${afterRollover.replace(/\s+/g, " ")} → ${(await topDate(a)).replace(/\s+/g, " ")}`,
);
await a.goto(`${BASE}/l/${lid}/player-stats`);
await id(a, "player-stats").waitFor({ timeout: 30_000 });
check("and the pages still load", (await a.locator(".alert-danger").count()) === 0);

// A reload while a league is being created.
await a.goto(`${BASE}/new`);
const cards = id(a, "club-choices").locator("button");
await cards.first().waitFor({ timeout: 30_000 });
await cards.nth(2).click();
await a.fill("#new-league-name", "Half made");
await id(a, "start-league").click();
await pause(400);
await a.reload();
await a.goto(`${BASE}/`);
await id(a, "league-list").waitFor({ timeout: 30_000 });
const half = a.locator('[data-testid="league-list"] tbody tr', { hasText: "Half made" });
let halfOutcome = "not saved";
if ((await half.count()) > 0) {
  await half.first().locator("a").first().click();
  await a
    .waitForFunction(
      () =>
        document.querySelector('[data-testid="play-button"]') ||
        document.querySelector(".alert-danger"),
      null,
      { timeout: 60_000 },
    )
    .catch(() => {});
  halfOutcome =
    (await id(a, "play-button").count()) > 0
      ? "saved and opens"
      : (await a.locator(".alert-danger").innerText()).replace(/\s+/g, " ");
}
check(
  "a reload while a league is created leaves no broken save (or says plainly what to do)",
  halfOutcome === "not saved" ||
    halfOutcome === "saved and opens" ||
    /save is incomplete[\s\S]*Delete it on Manage Leagues/.test(halfOutcome),
  halfOutcome,
);

// --- Long names --------------------------------------------------------------------------------------
await a.goto(`${BASE}/l/${lid}/settings`);
await a.fill("#league-name", "Long league name ".repeat(4).slice(0, 60));
await id(a, "rename").click();
await id(a, "settings-note").waitFor({ timeout: 15_000 });
const longName = (await a.inputValue("#league-name")).slice(0, 60);
check("a league name stops at 60 characters", longName.length <= 60, `${longName.length}`);
// The longest generated player name (about 35 characters), written into the save while the game
// is closed (the fallback worker holds no league open on the league list).
await a.close();
await pause(1500);
const c = await open();
await c.goto(`${BASE}/?worker=dedicated`);
await id(c, "league-list").waitFor({ timeout: 30_000 });
const longPid = await c.evaluate(async (lid) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(`league-${lid}`);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const tx = db.transaction(["meta", "players"], "readwrite");
  const get = (store, key) =>
    new Promise((res) => {
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => res(r.result);
    });
  const game = await get("meta", "game");
  const all = await new Promise((res) => {
    const r = tx.objectStore("players").getAll();
    r.onsuccess = () => res(r.result);
  });
  const star = all
    .filter((p) => p.cid === game.userCid && p.status === "club")
    .sort((x, y) => y.ovr - x.ovr)[0];
  tx.objectStore("players").put({
    ...star,
    firstName: "Francisco Javier",
    lastName: "Schönewolf-Greulich",
  });
  await new Promise((res) => (tx.oncomplete = res));
  db.close();
  return star.pid;
}, lid);
const overflows = [];
const pages = [
  "",
  "inbox",
  "standings",
  "cups",
  "schedule",
  "power-rankings",
  "finances",
  "history",
  "transactions",
  "squad",
  "tactics",
  "academy",
  "club-finances",
  "game-log",
  "team-history",
  "free-agents",
  "transfer-market",
  "league-leaders",
  "player-ratings",
  "player-stats",
  "team-stats",
  "injuries",
  "settings",
  `player/${longPid}`,
];
for (const path of pages) {
  await c.goto(`${BASE}/l/${lid}/${path}?worker=dedicated`);
  await c
    .waitForFunction(() => !document.querySelector("main")?.innerText.includes("Loading…"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await c.waitForTimeout(150);
  const wide = await c.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 1) overflows.push(`${path || "dashboard"} +${wide}px`);
  await scan(c);
}
check(
  "with the longest names, no page is wider than the window (1400 px)",
  overflows.length === 0,
  overflows.join(", "),
);
check(
  "the long player name shows on his profile",
  /Francisco Javier Schönewolf-Greulich/.test(await c.locator("main").innerText()),
);

// --- The fallback worker: one tab only ---------------------------------------------------------------
await c.goto(`${BASE}/l/${lid}?worker=dedicated`);
await id(c, "play-button").waitFor({ timeout: 60_000 });
const fallbackDate = await topDate(c);
await play(c, "One week");
check(
  "the fallback worker plays the game",
  (await topDate(c)) !== fallbackDate,
  `${fallbackDate.replace(/\s+/g, " ")} → ${(await topDate(c)).replace(/\s+/g, " ")}`,
);
const d = await open();
await d.goto(`${BASE}/l/${lid}?worker=dedicated`);
await d.getByText("already open in another tab").waitFor({ timeout: 30_000 });
check(
  "with the fallback worker, a second tab says the game is open in another tab",
  /Close that tab, then reload this one/.test(await d.locator("main").innerText()),
);
await c.close();
await pause(500);
await d.reload();
await id(d, "play-button").waitFor({ timeout: 60_000 });
check("once the first tab is closed, the second one runs the game", true);

// --- Errors in plain words ---------------------------------------------------------------------------
const plain = [];
const technical =
  /undefined|TypeError|Cannot read|InvalidStateError|DataCloneError|Something went wrong/;
for (const [path, want] of [
  [`l/${lid}/box-score/99999999`, /no match 99999999 in this league/],
  [`l/${lid}/squad/9999`, /no club 9999 in this league/],
  [`l/${lid}/team-history/9999`, /no club 9999 in this league/],
  [`l/${lid}/standings/XYZ`, /no league "XYZ" in this game/],
  ["l/99", /no league 99 in this browser/],
]) {
  await d.goto(`${BASE}/${path}?worker=dedicated`);
  await d
    .waitForFunction(() => document.querySelector(".alert"), null, { timeout: 30_000 })
    .catch(() => {});
  const text = (
    await d
      .locator(".alert")
      .first()
      .innerText()
      .catch(() => "")
  ).replace(/\s+/g, " ");
  if (!want.test(text) || technical.test(text)) plain.push(`${path}: "${text.slice(0, 90)}"`);
}
check("bad addresses get a plain message", plain.length === 0, plain.join(" | "));
await scan(d);

check("no real club names on any page visited", leaks.size === 0, [...leaks].join(", "));
check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(
  failures === 0 ? "\nAll tab, reload and message checks pass." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
