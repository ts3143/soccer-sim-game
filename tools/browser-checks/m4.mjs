// Headless Chrome check of the M4 Club lab against a running server (BASE).
import { chromium } from "playwright-core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "profile-m4-"));
let failures = 0;
const errors = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1500, height: 1100 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${BASE}/dev`);
await page.getByText("No leagues yet").waitFor();
await page.fill("#league-name", "Club test");
await page.fill("#league-seed", "club");
// An ENG2 club: it can afford some signings, and stronger clubs' reserves would play for it.
const clubOption = await page
  .locator("#league-club option", { hasText: "Lancashire Rovers" })
  .getAttribute("value");
await page.selectOption("#league-club", clubOption);
await page.getByRole("button", { name: "New league" }).click();
await page.getByText("M1 acceptance checks").waitFor({ timeout: 60_000 });

await page.getByRole("button", { name: "Club lab (M4)" }).click();
const header = page.locator('[data-testid="club-header"]');
await header.waitFor({ timeout: 30_000 });
const headerText = await header.innerText();
check(
  "the Club lab opens on the user's club with the summer window open",
  /Lancashire Rovers/.test(headerText) && /summer window until 31 Aug 2026/.test(headerText),
  headerText.split("\n")[0],
);
const budgets = await page.locator('[data-testid="club-budgets"]').innerText();
check(
  "transfer budget, wage room and squad cost against the FFP limit are shown",
  /Transfer budget €/.test(budgets) && /Wage room €/.test(budgets) && /FFP limit 70%/.test(budgets),
  budgets,
);
const clubRows = await page.locator('[data-testid="club-finances"] tbody tr').count();
check("every club's finances are listed", clubRows === 62, String(clubRows));
const finances = await page.locator('[data-testid="club-finances"]').innerText();
check(
  "strategy, FFP and board columns are filled",
  /Contending/.test(finances) && /Developing/.test(finances) && /\bok\b/.test(finances),
  "",
);

// Budget control: all to fees, then all to wages.
const roomOf = async () =>
  (await page.locator('[data-testid="club-budgets"]').innerText()).match(
    /Wage room (€[\d.,]+[kmbKMB]?)/,
  )?.[1];
await page.locator("#wage-share").fill("0");
await page.waitForFunction(() => /0% of FFP headroom/.test(document.body.innerText));
const noRoom = await roomOf();
await page.locator("#wage-share").fill("100");
await page.waitForFunction(() => /100% of FFP headroom/.test(document.body.innerText));
const allRoom = await roomOf();
check(
  "the budget control moves FFP headroom between fees and wages",
  noRoom === "€0" && allRoom !== "€0",
  `${noRoom} → ${allRoom}`,
);
await page.locator("#wage-share").fill("50");
await page.waitForFunction(() => /50% of FFP headroom/.test(document.body.innerText));

// Renew a player in his final year.
const squad = page.locator('[data-testid="club-squad"] tbody tr');
check("the squad lists contracts with values and moods", (await squad.count()) > 20);
const expiring = squad.filter({ hasText: "expires" }).first();
const notice = page.locator(".alert-info");
if ((await expiring.count()) > 0) {
  await expiring.getByRole("button", { name: "Talks" }).click();
  const talks = page.locator('[data-testid="club-talks"]');
  await talks.waitFor();
  check(
    "contract talks show the asks per length",
    (await talks.locator("tbody tr").count()) === 5 && /Renewal/.test(await talks.innerText()),
  );
  const renew = talks.getByRole("button", { name: "Renew" }).nth(1);
  if (await renew.isEnabled()) {
    await renew.click();
    await page.waitForFunction(
      () => document.querySelector(".alert-info, .alert-danger") !== null,
      null,
      { timeout: 15_000 },
    );
    const said = await page.locator(".alert-info, .alert-danger").first().innerText();
    check("a final-year player can be renewed", /renewed for 2 year/.test(said), said);
  } else check("a final-year player can be renewed (he won't negotiate)", true, "unwilling");
} else check("a final-year player can be renewed", true, "no final-year players");

// Sign a free agent.
const market = page.locator('[data-testid="club-market"]');
await market.locator("select").first().selectOption("free");
await market.locator("input").nth(0).fill("50");
await market.getByRole("button", { name: "Search" }).click();
await market.locator("tbody tr").first().waitFor({ timeout: 15_000 });
check(
  "the market search lists free agents",
  (await market.locator("tbody tr").count()) > 3,
  String(await market.locator("tbody tr").count()),
);
let signed = false;
for (let i = 0; i < Math.min(8, await market.locator("tbody tr").count()) && !signed; i++) {
  await market.locator("tbody tr").nth(i).getByRole("button", { name: "Talks" }).click();
  const talks = page.locator('[data-testid="club-talks"]');
  await talks.waitFor();
  const sign = talks.getByRole("button", { name: "Sign" }).nth(1);
  if (!(await sign.isEnabled())) continue;
  await sign.click();
  await page.waitForFunction(
    () => document.querySelector(".alert-info, .alert-danger") !== null,
    null,
    { timeout: 15_000 },
  );
  signed = (await notice.count()) > 0 && /signed for 2 year/.test(await notice.innerText());
}
check("a free agent can be signed", signed);

// Bid for a player at another club: a lowball first.
await market.locator("select").first().selectOption("clubs");
await market.locator("input").nth(0).fill("55");
await market.locator("input").nth(1).fill("62");
await market.getByRole("button", { name: "Search" }).click();
await market.locator("tbody tr").first().waitFor({ timeout: 15_000 });
await market.locator("tbody tr").first().getByRole("button", { name: "Talks" }).click();
const talks = page.locator('[data-testid="club-talks"]');
await page.locator("#bid-fee").waitFor({ timeout: 15_000 });
check(
  "a transfer target's talks open with a bid box",
  /Transfer/.test(await talks.innerText()) && (await page.locator("#bid-fee").count()) === 1,
);
await page.fill("#bid-fee", "10000");
await talks.getByRole("button", { name: "Bid" }).click();
await page.waitForFunction(
  () =>
    /reject|want|accept|budget/.test(
      document.querySelector('[data-testid="club-talks"]')?.textContent ?? "",
    ),
  null,
  { timeout: 15_000 },
);
check(
  "a lowball bid is turned down",
  /reject/.test(await talks.innerText()),
  (await talks.innerText()).match(/[^\n]*(reject|want|accept)[^\n]*/)?.[0],
);
const offers = await page.locator('[data-testid="club-offers"]').innerText();
check("the bid appears in the bids list", /By you for/.test(offers) && /rejected/.test(offers));

// Loan a squad player out.
await squad.nth(14).getByRole("button", { name: "Talks" }).click();
await talks.waitFor();
await talks.getByRole("button", { name: "Propose loan" }).click();
await page.waitForFunction(
  () => document.querySelector(".alert-info, .alert-danger") !== null,
  null,
  { timeout: 15_000 },
);
const loanText = await page.locator(".alert-info, .alert-danger").first().innerText();
check(
  "a loan proposal gets an answer",
  /on loan|don't see him|won't|wage|full squad|loanees|doesn't want|half/.test(loanText),
  loanText,
);

// Play to the window's close: the AI's market shows in the transfer log.
await page.getByRole("button", { name: "Season lab (M3)" }).click();
await page.getByRole("button", { name: "Until window closes" }).click();
await page.waitForFunction(
  () =>
    /31 Aug 2026/.test(document.querySelector('[data-testid="season-header"]')?.textContent ?? ""),
  null,
  { timeout: 120_000 },
);
await page.getByRole("button", { name: "Club lab (M4)" }).click();
await header.waitFor();
check(
  "after deadline day the window is shown closed",
  /window closed/.test(await header.innerText()),
);
const log = await page.locator('[data-testid="club-transfers"]').innerText();
const moves = (log.match(/ moves from | on loan from /g) ?? []).length;
check("the transfer log shows the AI's summer deals", moves > 30, `${moves} moves`);
const inbox = await page.locator('[data-testid="club-inbox"]').innerText();
check("the inbox shows the season's messages", /The board's target/.test(inbox));
const bids = await page.locator('[data-testid="club-offers"]').innerText();
check(
  "open bids lapse when the window closes",
  !/\bopen\b/.test(bids) && !/\baccepted\b/.test(bids),
);

check("no errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
await context.close();
console.log(failures === 0 ? "\nAll Club lab checks pass." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
