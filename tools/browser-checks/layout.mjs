// M7 laptop layout: every page at the sizes a laptop browser really shows, and the narrow layout
// below Bootstrap's `lg` breakpoint (992 px), where the sidebar hides behind "Menu". The pages
// include How to play, inside a league and on its own. At each size: no page is wider than the
// window (wide tables scroll inside their own box), the top bar keeps all its parts in one row,
// dialogs fit, the Live page works at 1280×720, and the Menu opens, closes, and closes on
// navigation. A 60-character league name and the longest club name on offer fill the top bar as
// much as it gets filled.
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const expected = JSON.parse(readFileSync(process.env.EXPECTED, "utf8"));
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-layout-"));
let failures = 0;
const errors = [];
const leaks = new Set();
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// What a browser leaves of a laptop screen: the tabs and toolbar (about 87 px) and the
// taskbar (about 48 px) take height, a 17 px scrollbar takes width (headless Chrome hides
// its own). Windows often scales a 1366×768 screen to 125%: 1093×614 CSS pixels, the
// tightest fit beside the sidebar (992–1199 px). The last size is a window under the 992 px
// breakpoint (half a 1920 screen), where the sidebar hides behind Menu.
const SIZES = [
  { name: "1280×720", width: 1263, height: 585 },
  { name: "1366×768", width: 1349, height: 633 },
  { name: "1366×768 at 125%", width: 1076, height: 506 },
  { name: "960 wide", width: 960, height: 600 },
];
const [LAPTOP, , SCALED] = SIZES;
const NARROW = SIZES.filter((s) => s.width < 992);
/** The sidebar sits under the top bar (`.app-sidebar { top: 60px }`): the bar may not be taller. */
const BAR_HEIGHT = 60;

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: LAPTOP.width, height: LAPTOP.height },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const testId = (id) => page.locator(`[data-testid="${id}"]`);
const scan = async () => {
  const text = await page.locator("body").innerText();
  for (const n of expected.realNames) if (text.includes(n)) leaks.add(n);
};
const settled = () =>
  page
    .waitForFunction(
      () => {
        const m = document.querySelector("main");
        return m !== null && !/Loading|Opening the league/.test(m.innerText);
      },
      null,
      { timeout: 30_000 },
    )
    .catch(() => {});
/** In-app navigation (no reload): the router listens to popstate. */
const visit = async (path) => {
  await page.evaluate((to) => {
    history.pushState(null, "", to);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await settled();
  await page.waitForTimeout(150);
};
const idle = () =>
  page.waitForFunction(
    () => {
      const b = document.querySelector('[data-testid="play-button"]');
      return b && !/Playing/.test(b.textContent ?? "");
    },
    null,
    { timeout: 300_000 },
  );
async function play(label) {
  await testId("play-button").click();
  await testId("play-menu").getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(100);
  await idle();
}

/**
 * What doesn't fit at the current size, in words. `show` lists elements that must be fully
 * on screen without scrolling (the page is scrolled to the top first); `window` says the
 * top bar should be showing a transfer window badge.
 */
const measure = (opts) =>
  page.evaluate(
    ({ show, window: withWindow, barHeight }) => {
      scrollTo(0, 0);
      const vw = innerWidth;
      const vh = innerHeight;
      const problems = [];
      const name = (el) =>
        el.dataset.testid
          ? `[${el.dataset.testid}]`
          : `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`;
      const clipped = (el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== "visible") return true;
        }
        return false;
      };
      const wide = document.documentElement.scrollWidth - vw;
      if (wide > 1) {
        // The outermost elements that stick out, outside any box that scrolls.
        const culprits = [...document.body.querySelectorAll("*")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.right <= vw + 1) return false;
            const p = el.parentElement?.getBoundingClientRect();
            return (!p || p.right <= vw + 1) && !clipped(el);
          })
          .slice(0, 3)
          .map(name);
        problems.push(`page ${wide}px too wide: ${culprits.join(", ")}`);
      }
      // Content wider than its card or column runs over its neighbours without widening the
      // page. The innermost box that overflows is named, with what sticks out of it.
      const boxes = [
        ...document.querySelectorAll('main .card, main [class^="col"], main [class*=" col-"]'),
      ].filter((el) => {
        if (el.getBoundingClientRect().width === 0) return false;
        if (getComputedStyle(el).overflowX !== "visible" || clipped(el)) return false;
        return el.scrollWidth > el.clientWidth + 1;
      });
      for (const box of boxes.filter((b) => !boxes.some((o) => o !== b && b.contains(o)))) {
        const edge = box.getBoundingClientRect().right;
        const out = [...box.querySelectorAll("*")].find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > edge + 1 && !clipped(el);
        });
        problems.push(
          `${out ? name(out) : "content"} ${box.scrollWidth - box.clientWidth}px wider than its ${name(box)}`,
        );
      }
      const bar = document.querySelector('[data-testid="top-bar"]');
      if (bar) {
        const b = bar.getBoundingClientRect();
        if (bar.scrollWidth > bar.clientWidth + 1)
          problems.push(`top bar ${bar.scrollWidth - bar.clientWidth}px too wide`);
        if (b.height > barHeight + 0.5) problems.push(`top bar ${Math.round(b.height)}px tall`);
        const parts = {
          "Play button": '[data-testid="play-button"]',
          date: '[data-testid="game-date"] > span:nth-child(1)',
          phase: '[data-testid="game-date"] > span:nth-child(2)',
          "league name": '[data-testid="league-name"]',
          club: '[data-testid="user-club"] span',
          ...(withWindow ? { "window badge": '[data-testid="game-date"] .badge' } : {}),
        };
        let left = -Infinity;
        for (const [label, sel] of Object.entries(parts)) {
          const el = bar.querySelector(sel);
          const r = el?.getBoundingClientRect();
          if (!r || r.width < 1 || r.left < 0 || r.right > vw + 1)
            problems.push(`top bar: ${label} doesn't show`);
          else if (r.top < b.top - 1 || r.bottom > b.bottom + 1)
            problems.push(`top bar: ${label} sticks out`);
          else if (label !== "window badge" && label !== "phase" && r.left < left - 1)
            problems.push(`top bar: ${label} overlaps`);
          if (r) left = Math.max(left, r.right);
        }
      }
      for (const sel of show ?? []) {
        const el = document.querySelector(sel);
        const r = el?.getBoundingClientRect();
        if (!r || r.width < 1) problems.push(`${sel} missing`);
        else if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1)
          problems.push(
            `${sel} not on screen (${Math.round(r.top)}–${Math.round(r.bottom)} of ${vh})`,
          );
      }
      return problems;
    },
    { show: [], window: false, barHeight: BAR_HEIGHT, ...opts },
  );

/** Wide tables may scroll sideways in their own box: how many do, for the report. */
const scrollingTables = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll(".table-responsive")].filter(
        (t) => t.getBoundingClientRect().width > 0 && t.scrollWidth > t.clientWidth + 1,
      ).length,
  );

/**
 * Runs `measure` at every size (or the given ones); problems carry the size's name. `each`
 * runs at each size after the measurement.
 */
async function atSizes(opts = {}, sizes = SIZES, each = async () => {}) {
  const problems = [];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(120);
    for (const p of await measure(opts)) problems.push(`${size.name}: ${p}`);
    await each(size);
  }
  await page.setViewportSize({ width: LAPTOP.width, height: LAPTOP.height });
  return problems;
}

/** A dialog fits: inside the window's width, and its buttons on screen or reachable by scrolling. */
const dialogFits = (id) =>
  page.evaluate((id) => {
    const modal = document.querySelector(`[data-testid="${id}"]`);
    const dialog = modal?.querySelector(".modal-dialog")?.getBoundingClientRect();
    const footer = modal?.querySelector(".modal-footer")?.getBoundingClientRect();
    if (!dialog || !footer) return "no dialog";
    if (dialog.left < 0 || dialog.right > innerWidth + 1) return "wider than the window";
    const scrolls = modal.scrollHeight > modal.clientHeight + 1;
    if (footer.bottom > innerHeight + 1 && !scrolls) return "buttons below the window";
    if (document.documentElement.scrollWidth > innerWidth + 1) return "page wider than the window";
    return null;
  }, id);
async function dialogAtSizes(label, id, open, close) {
  const problems = [];
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open();
    await testId(id).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
    const problem = await dialogFits(id);
    if (problem) problems.push(`${size.name}: ${problem}`);
    await close();
    await testId(id).waitFor({ state: "detached", timeout: 15_000 });
  }
  await page.setViewportSize({ width: LAPTOP.width, height: LAPTOP.height });
  check(`${label} fits at every size`, problems.length === 0, problems.join("; "));
}

// --- New league: the club cards and the form --------------------------------------------------------
await page.goto(`${BASE}/new`);
const cards = testId("club-choices").locator("button");
await cards.first().waitFor({ timeout: 30_000 });
let newProblems = await atSizes();
const names = await cards.locator(".fw-semibold").allInnerTexts();
const longest = names.reduce((best, n, i) => (n.length > names[best].length ? i : best), 0);
await cards.nth(longest).click();
const club = names[longest];
const leagueName = "A Very Long League Name, Typed Right Up To The Sixty Limit!!";
await page.fill("#new-league-name", leagueName);
await page.fill("#new-league-seed", "layout");
newProblems = [...newProblems, ...(await atSizes())];
check(
  "New league: the club cards and the form fit",
  newProblems.length === 0,
  newProblems.join("; "),
);
await testId("start-league").click();
await testId("top-bar").waitFor({ timeout: 60_000 });
const lid = Number(page.url().match(/\/l\/(\d+)/)?.[1]);
console.log(`      ${club}, "${leagueName}" (${leagueName.length} characters)`);
await settled();

// --- The top bar and the Play menu ---------------------------------------------------------------------
const bar = await atSizes({ window: true });
check("the top bar fits in one row, with every part showing", bar.length === 0, bar.join("; "));
const menuProblems = [];
for (const size of SIZES) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await testId("play-button").click();
  const r = await testId("play-menu").boundingBox();
  if (!r || r.x < 0 || r.x + r.width > size.width || r.y + r.height > size.height)
    menuProblems.push(size.name);
  await testId("play-button").click();
}
await page.setViewportSize({ width: LAPTOP.width, height: LAPTOP.height });
check("the Play menu opens inside the window", menuProblems.length === 0, menuProblems.join(", "));

// --- Watching a match (on screen without scrolling: at 1280×720 and at 125%) ----------------------
await play("Watch your next match");
await page.waitForFunction(() => location.pathname.endsWith("/live"), null, { timeout: 120_000 });
await testId("pre-match").waitFor({ timeout: 30_000 });
let live = await atSizes({ window: true });
live = [...live, ...(await atSizes({ show: ['[data-testid="live-play"]'] }, [LAPTOP, SCALED]))];
check(
  "Live, before kick-off: the line-up editor fits, Kick off is on screen",
  live.length === 0,
  live.join("; "),
);
// Someone in the saved line-up hurt or banned by now: Auto leaves him out (T, 2026-10-25).
if ((await testId("kickoff-blocked").count()) > 0) {
  await testId("pre-match").getByRole("button", { name: "Auto" }).click();
  await testId("kickoff-blocked").waitFor({ state: "detached" });
}
await page.locator("#live-speed").focus();
await page.keyboard.press("End");
await testId("live-play").click();
await page.waitForFunction(
  () => document.querySelector('[data-testid="changes"], [data-testid="live-done"]'),
  null,
  { timeout: 120_000 },
);
const halfTime = (await testId("changes").count()) > 0;
if (halfTime) {
  live = await atSizes({ window: true });
  live = [
    ...live,
    ...(await atSizes(
      {
        show: [
          '[data-testid="live-scoreboard"]',
          '[data-testid="live-play"]',
          '[data-testid="changes-title"]',
        ],
      },
      [LAPTOP, SCALED],
    )),
  ];
  const buttons = await page.evaluate(() =>
    ["apply-changes", "resume"].map((id) => {
      const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
      return r && r.width > 0 && r.right <= innerWidth ? null : id;
    }),
  );
  live = [...live, ...buttons.filter(Boolean).map((b) => `${b} button out of reach`)];
}
check(
  "Live, at a break: scoreboard, controls and the changes screen fit",
  halfTime && live.length === 0,
  halfTime ? live.join("; ") : "no break reached",
);
if (halfTime) {
  await testId("resume").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="changes"]'), null, {
    timeout: 15_000,
  });
  // While the match runs: the scoreboard, the controls and the newest lines of the feed.
  const running = await page.evaluate(() => {
    scrollTo(0, 0);
    const feed = document.querySelector('[data-testid="live-feed"]')?.getBoundingClientRect();
    const play = document.querySelector('[data-testid="live-play"]')?.getBoundingClientRect();
    return {
      feedTop: feed?.top ?? Infinity,
      playBottom: play?.bottom ?? Infinity,
      vh: innerHeight,
    };
  });
  check(
    "Live, while playing at 1280×720: controls and the newest commentary on screen",
    running.playBottom <= running.vh && running.feedTop <= running.vh - 150,
    `controls end at ${Math.round(running.playBottom)}, commentary starts at ${Math.round(running.feedTop)} of ${running.vh}`,
  );
}
for (;;) {
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="live-done"]') ||
      document.querySelector('[data-testid="live-end"]'),
    null,
    { timeout: 120_000 },
  );
  if ((await testId("live-done").count()) > 0) break;
  await testId("live-end").click();
  await page.waitForTimeout(500);
}
live = await atSizes({ window: true });
live = [
  ...live,
  ...(await atSizes({ show: ['[data-testid="live-scoreboard"]', '[data-testid="live-done"]'] }, [
    LAPTOP,
    SCALED,
  ])),
];
check("Live, at full time: the result and the links fit", live.length === 0, live.join("; "));
await scan();
const motmOf = async (id) =>
  (await testId(id).innerText()).replace(/^.*Man of the match:\s*/s, "").trim();
const liveMotm = await motmOf("live-motm");
await testId("live-done").getByRole("link", { name: "Box score" }).click();
await testId("box-score").waitFor({ timeout: 30_000 });
const boxPath = new URL(page.url()).pathname;
const topRated = await testId("box-score").evaluate((box) => {
  const rows = [...box.querySelectorAll(".table-hover tbody tr")];
  const rating = (tr) => Number(tr.lastElementChild?.textContent);
  const best = Math.max(...rows.map(rating));
  const starred = rows.filter((tr) => tr.querySelector(".motm-star"));
  return starred.length === 1 && rating(starred[0]) === best;
});
check(
  "full time and the box score name the same man of the match, starred, with the top rating",
  liveMotm !== "" && (await motmOf("motm")) === liveMotm && topRated,
  `live "${liveMotm}", box score "${await motmOf("motm")}"`,
);

// --- Every page at every size -------------------------------------------------------------------------
async function allPages(stage, withWindow) {
  await visit(`/l/${lid}`);
  const links = await testId("sidebar")
    .locator('a[href^="/l/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  await visit(`/l/${lid}/squad`);
  const playerPath = await testId("squad-table")
    .locator('tbody a[href*="/player/"]')
    .first()
    .getAttribute("href");
  const paths = [...links, playerPath, boxPath, `/l/${lid}/live`];
  const problems = [];
  const sideways = new Map(SIZES.map((size) => [size.name, []]));
  for (const path of paths) {
    await visit(path);
    await scan();
    const key = path.split("/")[3] ?? "dashboard";
    const noteTables = async (size) => {
      if ((await scrollingTables()) > 0) sideways.get(size.name).push(key);
    };
    for (const p of await atSizes({ window: withWindow }, SIZES, noteTables))
      problems.push(`${path}: ${p}`);
  }
  check(
    `${stage}: all ${paths.length} league pages fit at every size, top bar included`,
    problems.length === 0,
    problems.slice(0, 8).join("; ") +
      (problems.length > 8 ? `; and ${problems.length - 8} more` : ""),
  );
  for (const [size, pages] of sideways)
    console.log(`      ${size}: a table scrolls sideways on ${pages.join(", ") || "no page"}`);
}
await allPages("after the first match", true);

// --- Dialogs ----------------------------------------------------------------------------------------
await visit(`/l/${lid}/free-agents`);
await testId("free-agents").locator("tbody tr").first().waitFor({ timeout: 30_000 });
await dialogAtSizes(
  "the contract window (a free agent)",
  "contract-modal",
  () =>
    testId("free-agents")
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "Negotiate" })
      .click(),
  () => page.keyboard.press("Escape"),
);
await visit(`/l/${lid}/transfer-market`);
await testId("market-search").locator("tbody tr").first().waitFor({ timeout: 30_000 });
await dialogAtSizes(
  "the contract window (a bid)",
  "contract-modal",
  () =>
    testId("market-search")
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "Bid" })
      .click(),
  () => page.keyboard.press("Escape"),
);
await visit(`/l/${lid}/squad`);
await visit(
  await testId("squad-table").locator('tbody a[href*="/player/"]').first().getAttribute("href"),
);
await testId("profile-list").waitFor({ timeout: 30_000 });
for (const [label, id, opener] of [
  ["List for transfer", "list-dialog", () => testId("profile-list").click()],
  ["Loan out", "loan-dialog", () => page.getByRole("button", { name: "Loan out" }).click()],
  ["Release", "release-dialog", () => testId("profile-release").click()],
]) {
  await dialogAtSizes(`the ${label} dialog`, id, opener, () => page.keyboard.press("Escape"));
}

// --- The narrow layout: the sidebar behind "Menu" ---------------------------------------------------
for (const size of NARROW) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await visit(`/l/${lid}`);
  const sidebarShown = () =>
    page.evaluate(() => {
      const r = document.querySelector('[data-testid="sidebar"]')?.getBoundingClientRect();
      return r !== undefined && r.width > 0;
    });
  const hiddenAtFirst = !(await sidebarShown());
  const menu = testId("menu-button");
  await menu.click();
  const opened = await page.evaluate(() => {
    const side = document.querySelector('[data-testid="sidebar"]');
    const r = side?.getBoundingClientRect();
    const bar = document.querySelector('[data-testid="top-bar"]')?.getBoundingClientRect();
    if (!r || r.width === 0) return "doesn't open";
    if (r.left < 0 || r.right > innerWidth) return "sticks out sideways";
    if (bar && r.top < bar.bottom - 1) return "starts under the top bar";
    if (r.bottom > innerHeight + 1) return "runs below the window";
    const last = [...side.querySelectorAll("a")].at(-1);
    if (
      !last ||
      (side.scrollHeight > side.clientHeight + 1 && getComputedStyle(side).overflowY === "visible")
    )
      return "can't reach its last link";
    return null;
  });
  // Close with the same button.
  let closes = false;
  if (opened === null) {
    await menu.click({ timeout: 3000 }).catch(() => {});
    closes = !(await sidebarShown());
  }
  // Open again, pick a page: the menu closes and the page changes.
  await menu.click({ timeout: 3000 }).catch(() => {});
  await testId("sidebar")
    .getByRole("link", { name: "Standings" })
    .click({ timeout: 3000 })
    .catch(() => {});
  await settled();
  const navigated = /\/standings/.test(page.url());
  const closedOnNav = !(await sidebarShown());
  check(
    `${size.name}: the sidebar starts hidden, opens and closes with Menu, and closes on navigation`,
    hiddenAtFirst && opened === null && closes && navigated && closedOnNav,
    [
      !hiddenAtFirst && "shown at first",
      opened,
      opened === null && !closes && "Menu doesn't close it",
      !navigated && "a link doesn't navigate",
      !closedOnNav && "stays open after navigating",
    ]
      .filter(Boolean)
      .join(", "),
  );
}
await page.setViewportSize({ width: LAPTOP.width, height: LAPTOP.height });

// --- A season later: history, awards, last season's tables ------------------------------------------
await visit(`/l/${lid}`);
await play("Until the end of the season");
await play("Proceed to promotion and relegation");
await play("Advance to preseason");
await allPages("the next preseason", true);

// --- Manage Leagues and How to play -----------------------------------------------------------------
await page.goto(`${BASE}/`);
await testId("league-list").waitFor({ timeout: 30_000 });
let home = await atSizes();
await scan();
await testId("how-to-play-link").click();
await testId("how-to-play").waitFor({ timeout: 30_000 });
home = [...home, ...(await atSizes())];
await scan();
check("Manage Leagues and How to play fit at every size", home.length === 0, home.join("; "));

check("no real club names on any page visited", leaks.size === 0, [...leaks].join(", "));
check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll layout checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
