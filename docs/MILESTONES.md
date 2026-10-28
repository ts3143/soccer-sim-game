# MVP Build Plan

Build in this order: **engine and simulation first, UI last.** Each milestone ends with its acceptance checks passing, tests green, and a short note in `docs/PROGRESS.md` (what was built, deviations, open issues). Don't start a milestone until the previous one is accepted by T.

---

## M0 — Scaffold and plumbing
**Build**
- Vite + React + TypeScript (strict) + Bootstrap 5, pnpm, Vitest, ESLint/Prettier.
- Folder layout per SPEC §13; copy `data/` from the kickoff package.
- Shared Worker (Web Worker fallback) with typed UI↔worker calls; IndexedDB wrapper + in-memory cache skeleton; seeded RNG module.
- GitHub repo `soccer-sim-game` (public) + Cloudflare Pages deploy with SPA routing.
- Scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm calibrate` (stub).

**Accept**
- Deployed page calls a worker function, writes and reads a value in IndexedDB, survives reload; two tabs share the same worker state.
- Same seed → same random sequence (unit test).

---

## M1 — Data, generation and new league
**Build**
- Shared schema/types for every store in SPEC §12.
- Load `clubs_2026_27.json`, competition/formation/rating configs. Strip `based_on` at build time so it never reaches the app bundle or a save (the data file keeps it).
- Name files per nationality in `data/names/` from public-domain or permissively licensed sources; document sources in `data/names/SOURCES.md`.
- Player generator: bio, 22 ratings by archetype, height/weight, preferred foot, all 10 position OVRs, hidden ceiling, curve type, hidden traits, mood traits.
- Fit the fixed per-position OVR scaling constants once and store them in `ratings_positions.json` → `ovrScaling`.
- Squad generator: 22–24 senior + 9–12 academy per club (T, 2026-10-15; was 4–6). Each club gets a seeded default formation from the 5 MVP presets; its squad is built around it and saved as its starting tactics; tuned so the best-XI OVR in that formation hits `strength` (±1). Contracts and wages so each club starts at ~50–65% squad cost ratio.
- Seeded free-agent pool.
- Development core (pure functions): age curves per rating group and curve type, the dev multiplier, growth/decline per SPEC §5.3. Pulled forward from M3 because POT depends on it; M3 wires it into the season and calibrates it.
- POT via cheap simulated arcs (provisional until M3 calibration).
- New league creation writes a full save.
- Generation inspector page (developer-only, replaced in M5) and `pnpm generate --check`, a headless report of the acceptance checks that CI also runs.

**Accept**
- New league: 62 clubs, ~2,100 club players including academies (22–24 senior + 9–12 academy per club, i.e. 1,922–2,232; T, 2026-10-15), free agents on top; plausible OVR distribution (few 75+, many 50–65).
- Every club's best-XI OVR in its default formation within ±1 of `strength`; hierarchy matches club data.
- OVR is a pure function of ratings + config (scaling constants stored, never recomputed per save).
- `based_on` is absent from the production bundle and from saved data (automated check).
- Generation is deterministic for a given seed. Unit tests on OVR, generator and the development core (incl. a benched 33-year-old doesn't decline slower than a starter).

---

## M2 — Match engine (headless) + calibration harness
**Build**
- Team ratings from XI + sliders + formation (Set Pieces = the taker's delivery only; Aerial counts once in the set-piece matchup).
- Possession chain, xG, events, cards, fouls, penalties, corners, set pieces, injuries in match, energy drain and effective ratings.
- Substitutions (5 in 3 windows; +1 sub and +1 window in extra time) and AI in-game rules; extra time and penalties.
- Match ratings; box score, scoring summary, key events, team stats.
- **Resumable API:** `start → step(n possessions) → applyChanges(subs/sliders/formation) → … → finish`.
- `pnpm calibrate`: sims many matches/seasons headlessly in Node and prints a pass/fail report against `calibration_targets.json`: neutral-engine targets, then per-league checks (target × modifier). Season targets (champion points, top scorer, …) are reported for information; they are gated in M3, with the real calendar, rotation and fatigue.
- Engine coefficients live in one code module (`src/worker/engine/coefficients.ts`) and can be overridden in memory by the harness for tuning runs; `data/config` keeps the spec-level rules.
- Match lab page (developer-only, replaced in M6): sim a match between any two clubs of a saved league and see the box score; step through it with pause/resume; sim 1,000 matches in the browser against the targets.

**Accept**
- Per-match calibration targets pass over ≥ 10,000 simulated matches with all style modifiers neutral; each league passes its target × modifier checks (`leagueChecks`).
- Stronger teams win more; sliders change outcomes in the intended direction (unit tests). The parity target (top-6 losing to bottom-6) is reported here and gated in M3 (T, 2026-10-14).
- A paused-and-resumed match with no changes produces the identical result to an uninterrupted one with the same seed.
- One headless match < 5 ms.

---

## M3 — Season loop (headless)
**Build**
- Calendar and fixture generation (weekend/midweek slots, ENG2 midweek rounds, GER1 winter break), standings, tie-breakers (per league, from config).
- Cups (draws, byes, ET/pens; in season 1 the German cup preliminary round uses the 4 lowest-`strength` clubs), Championship play-offs (6 clubs: midweek eliminators after the final round, two-legged semis over a weekend + midweek, final around 23–25 May), promotion/relegation.
- Condition, recovery by days elapsed, injuries tied to condition and Medical dial, in matches and in training (T, 2026-10-15).
- Rotation/lineup AI with mid-term view; if fewer than 16 seniors are fit, academy players aged 16+ fill the bench.
- Development updates (summer, winter), using the development core built in M1: dev multiplier on growth only, blending to neutral between 23 and 27; decline = age × Medical dial; small mental minutes bonus at any age. Aging, ceiling decay, retirement, youth intake, academy promotion/release, pruning (a pruned player's stat rows go with him).
- Phase machine and dated events; Play-menu actions as worker functions.
- End-of-season awards and history rows (Player of the Year, Golden Boot, Team of the Season per league; champions, promotions/relegations, cup winners), saved in `awards`; their pages come in M5.
- **Temporary squad upkeep until M4:** contracts roll over instead of expiring, and each preseason AI clubs top up to 22 seniors, first by promoting academy players, then by signing the best-fitting free agents. M4 replaces it with renewals, transfers and the free-agent market.
- Season lab page (developer-only, replaced in M5): the Play-menu actions, tables, results, cups and play-offs, leaders, injuries, awards, and a full-season timer.

**Accept**
- A 20-season headless run completes without errors; season and development calibration targets pass; player count stays within ±10%. Promoted-club survival and the finance checks are gated in M4, once transfers and finances exist (T, 2026-10-14). The well-played 18–21 growth target is gated in M4 too (T, 2026-10-15): transfers and loans change who gets minutes.
- Top-club starters' minutes share within target; at least 3 distinct ENG1 champions in 20 seasons; parity (top-6 losing to bottom-6) within target, with rotation, fatigue and injuries in place.
- Development unit tests: a benched 33-year-old doesn't decline slower than a starter; the dev multiplier never changes decline; the multiplier is neutral from 27.

---

## M4 — Economy and market (headless)
**Build**
- Revenue streams, budget dials, cash flow (current cash on the club, season-end snapshot in `clubSeasons`), board expectations (per-league targets in config; GER1's lowest is "finish above the bottom 3") and confidence, firing.
- FFP squad cost ratio, warning → one-window transfer ban.
- Mood, contracts, negotiation; renewals only in windows, no end-of-season re-sign phase (contracts ending 30 June must be renewed by 31 January; AI follows the same rule). Inbox: a warning when the January window opens listing every player in his final six months, and a reminder before deadline day.
- Transfers (two-step), AI strategy and valuation, AI-to-AI deals, bids for user players, market value; loans; free-agent pool dynamics.
- Opening squads carry notional past transfer fees (about 30% of squad cost), with wages about 70% of the M1 levels (T, 2026-10-16). TV money and cup prize money are set per league and per cup in config.
- The AI never renews, buys or sells for the user's club: unrenewed contracts expire and offers wait in the inbox (in the headless harness the AI runs every club).
- Club lab page (developer-only, replaced in M5/M6): all clubs' finances, board, squad cost ratios, the transfer log and the inbox; renew a player, sign a free agent, bid for a player, accept or reject an offer.

**Accept**
- 20-season run: world-stability checks in `calibration_targets.json` pass (negative-cash share, squad cost ratios, promoted-club survival, etc.).
- Development and world shape, deferred from M3 (T, 2026-10-15): well-played 18–21-year-olds gain +4 to +8 OVR a year; over 20 seasons the senior OVR distribution stays stable (mean, 75+ share) and players peak around 27–29, not earlier. (End of M3: +3.8 a year; mean 57.0 → 54.7; 75+ share 2.6% → 6.4%; 21–23-year-olds rated above 27–29-year-olds by the last season.)
- Wage/fee levels stay plausible relative to revenue; no runaway inflation or deflation.
- Exploit checks: can't buy a star by offering several average players' worth; weak-loan development exploit doesn't work.
- Contracts not renewed by 31 January (user or AI) expire on 30 June and the players become free agents on 1 July; the January inbox warning and deadline-day reminder fire.

---

## M5 — Core UI
**Build**
- App shell mirroring ZenGM: top bar with Play menu, sidebar sections, team dropdown on team pages.
- New league screen; Dashboard; Inbox (moved from M6, T 2026-10-19); Standings; Cups; Weekly Schedule; Squad (with contract-expiry badges); Player profile (incl. radar chart and OVR/POT history); Box score / Game log; League Leaders; Player Ratings; Player Stats; Team Stats; Injuries; History (league and team); Transactions; Power Rankings; Finances overview of all clubs.

**Accept**
- A full season can be played start to finish using only the Play menu, and every listed page renders correct data.
- Real club names (`based_on`) appear nowhere in the UI.

---

## M6 — Management UI
**Build**
- Tactics page (formation dropdown, drag-and-drop slots and bench, sliders, live team ratings; no Auto toggle: they apply to matches the user watches).
- Watch live: pre-match temporary changes, live feed, stats, energy bars, subs, sliders, pause/adjust, half-time screen.
- Transfer Market (Search, Your listed players, Incoming offers, Loans), Free Agents, Contract negotiation modal.
- Youth Academy; Finances/Facilities (own club); Settings; Manage Leagues; "You're fired" flow. (Inbox moved to M5.)

**Accept**
- T can run his club through 3+ seasons entirely in the UI: sign, sell, loan, renew, set tactics, watch and change a match live, promote academy players.

---

## M7 — Polish and release v0.1
**Build**
- Performance pass against the budget; retention and pruning verified; save-size check after 10 seasons.
- Bug bash; empty/edge states; basic responsive layout so nothing breaks on a laptop screen.

**Accept**
- Performance budget met; no known crashers; deployed to Cloudflare Pages as v0.1.

---

# Super League build plan (T, 2026-10-27)

SPEC §17. Same rules as above: engine and simulation first, UI last; ~1-hour chunks, a check-in after each. **Every milestone also ends with Classic's gates green**: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm calibrate --check`, `pnpm calibrate --world --check`, `pnpm generate --check` and the browser checks. Super League must never change a Classic result.

## SL0 — Worlds as data
**Build**
- A world = clubs file + competitions config + switches (SPEC §17.1). Classic is today's files, content unchanged.
- The save records its world; the worker reads that world's config through the session, not from global imports (today `competitionsConfig` and `clubDefinitions` are imported by about 35 files). League DB version bump; older saves become Classic.
- The headless tools (`calibrate`, `generate`, `tools/season.ts`) take a world.

**Accept**
- Same seed → the same Classic world and the same season results as `main` (a determinism test against a recorded run).
- An older save opens as Classic and plays on.

## SL1 — Super League data and generation
**Build**
- Clubs file for the 48 (T's names; club values proposed to T for approval), generated crests, a Ukrainian names file (missing today), nationality mixes for the new countries.
- Competitions config: three tiers of 16, places up and down, play-off formats, board targets, TV pools.
- Classic: the 14 shared clubs take T's names (name, short name, abbreviation, crest initials; city unchanged).
- Generation without academies, with payrolls at 85–100% of the tier's cap (a placeholder cap until SL3).
- New game (worker side): create a Super League save.

**Accept**
- 48 clubs; every club's best-XI OVR within ±1 of `strength`; tiers ordered by strength on average.
- `pnpm generate --check` passes for both worlds. A new Classic world generates exactly as before (names aside).
- No real names in the bundle.

## SL2 — Season, play-offs and the first harness
**Build**
- General play-off brackets in config (rounds, legs, seeding, venue), replacing the two hardcoded shapes; ENG2's play-off rewritten in it.
- The Star title play-off; the Gold and Blue 2nd–5th play-offs; the calendar (30 rounds, play-offs in May); champion and table winner in history; awards per tier.
- The Super League off-season phases (lottery, draft, re-signing) as stubs, so the year runs end to end.
- `pnpm calibrate --world superleague`, first version: tier mobility and yo-yo report.

**Accept**
- A 20-season headless run with the configured places up and down between every pair of tiers each season (2 and 2 when SL2 was built; 3 and 3 from SL6, T 2026-10-28), and nobody out of Blue.
- ENG2's play-offs give identical results to before.

## SL3 — Soft cap and finances
**Build**
- Payroll, the cap by tier, the grace season, the minimum wage, salary matching in trades (rule only), the luxury tax and its sharing.
- FFP off by switch; TV money by tier; play-off prize money; the Youth dial gone.
- The base cap and the TV pools proposed to T.

**Accept**
- Finance unit tests (cap, grace, tax, a released player's wages on the cap).
- The harness reports cap violations and tax paid.

## SL4 — Draft
**Build**
- The draft class, the lottery (pool, odds table, picks drawn), the full order, picks as owned assets up to 3 seasons ahead, rookie contracts.
- AI drafting; the user's picks (worker calls); undrafted prospects to free agency.
- The re-signing period (ZenGM) and free agency opening 1 July; the 25-player limit from the first match.

**Accept**
- Lottery odds unit-tested against the config table over many draws.
- Over 20 seasons the player pool stays within Classic's ±10% and the OVR and age distributions stay stable.

## SL5 — Trades
**Build**
- Trade valuation (players and picks; OVR, POT, age, contract, cap space, contending or rebuilding).
- AI-to-AI trades on market days while trades are open; AI offers to the user; the trading block.
- The user's proposals and "What would make this work?" (worker calls); the roster deadline; salary matching for clubs over the cap.
- AI salary shedding for over-cap clubs after their grace season. The transfer market and loans off by switch.

**Accept**
- Exploit checks: two average players never buy a star; a pick's value falls with the years left and with a stronger original owner.
- In the harness, over-cap relegated clubs are back under the cap within a season of their grace ending.

## SL6 — Validation and tuning
**Build**
- The full Super League report (SPEC §17.9) with targets in `calibration_targets.json`.
- Tuning of config (lottery odds, cap levels, TV pools, rookie scale, class size) and of AI coefficients, never results. The report is added to CI.

**Accept**
- Targets pass with CI's seed; if the 4–6-season rise can't be met by tuning, it goes back to T with the numbers.

## SL7 — UI
**Build**
- New game: the Classic / Super League choice and the names file.
- Standings (three tiers, zones, the lottery-odds column); Play-offs brackets.
- Draft, Trade, Trading Block, Re-sign Players, the team's draft picks; Finances with the cap.
- The top bar; the sidebar without Transfer Market, Loans and Youth Academy; Play-menu steps for the new phases; How to play.
- Browser checks for Super League.

**Accept**
- T can run a Super League club through 3+ seasons in the UI: trade (picks included), draft, re-sign, sign free agents, get promoted or relegated, live with the cap.
- Every existing browser check passes on Classic.

## SL8 — Release
**Build**
- All gates on both worlds; CHANGELOG; T's local test; PR; v0.3.0.

**Accept**
- T's OK after his local test; production serves it.
