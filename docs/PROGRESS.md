# Build Progress

Claude Code updates this file at the end of each milestone.

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 Scaffold and plumbing | **Accepted** (T, 2026-10-14) | All acceptance checks pass locally and on the Cloudflare preview; T tested in Chrome and Safari. See "M0 notes" below. |
| M1 Data, generation and new league | **Accepted** (T, 2026-10-14) | All checks pass locally, in CI and on the Cloudflare preview (18/18 headless Chrome); T tested in Chrome and Safari. See "M1 notes" below. |
| M2 Match engine + calibration harness | **Accepted** (T, 2026-10-14) | All gates pass locally, in CI (`calibrate --check`) and on the Cloudflare preview (Match lab 11/11, M1 18/18 headless Chrome); T tested in the browser. Parity is gated in M3 (T). See "M2 notes" below. |
| M3 Season loop | **Accepted** (T, 2026-10-16) | All M3 gates pass locally, in CI (`calibrate --world --check`, 16 checks) and on the Cloudflare preview (Season lab 19/19, Match lab 11/11, M1 18/18 headless Chrome); T tested in the browser. Young regulars' growth and world shape gated in M4 (T). See "M3 notes" below. |
| M4 Economy and market | **Built**, awaiting T's local test | All 11 chunks built. Every gate passes locally: unit tests (222), `generate --check`, `calibrate --check` (engine) and `calibrate --world --check` (20 seasons, M2–M4 gates incl. economy, world shape and exploits); headless Chrome Club lab 19/19, Season lab 21/21, M1 18/18, Match lab smoke. See "M4 notes" below. |
| M5 Core UI | Not started | |
| M6 Management UI | Not started | |
| M7 Polish and release v0.1 | Not started | |

## Deviations from spec
Record every approved change to SPEC.md here, with date and reason. "Review #N" = item N of the kickoff review (answers in `OPEN_QUESTIONS.md` §A2).

| Date | Item | Change (approved by T) | Reason | Where |
| --- | --- | --- | --- | --- |
| 2026-10-14 | Review #1 | "~1,800 players" means all club players including academies; free agents on top. M1 check reworded (expected range 1,612–1,860). | 62 clubs × 25 seniors max = 1,550, so "1,800 senior" could never be met. | SPEC §2.1; MILESTONES M1 |
| 2026-10-14 | Review #2 | Clubs start with 22–24 seniors; the cap stays 25. | Clubs starting at the cap couldn't sign anyone in the first window without selling first. | SPEC §2.1, §7.1; `competitions_mvp.json` → `rosterRules.startingSeniors`; MILESTONES M1 |
| 2026-10-14 | Review #3 | Each club gets a seeded default formation from the 5 MVP presets; its squad is built around it, it is saved as starting tactics, and `strength` is measured in it. Preset weights are equal. | `strength` was defined "in its default formation", but the club data has none. | SPEC §8.2, §8.3, §12; `formations_tactics.json` → `defaultFormation`; MILESTONES M1 |
| 2026-10-14 | Review #4 | OVR uses fixed per-position scaling constants, fitted once in M1 and stored in config; they change only through a deliberate refit (planned v1.1). | Rescaling per save would make every OVR drift as the population changes. | SPEC §4.3, §15; `ratings_positions.json` → `_note`, `ovrScaling`; MILESTONES M1 |
| 2026-10-14 | Review #5 | `based_on` is stripped from the shipped build and from saves; the data file and repo keep it. | Importing the club file would put real club names in the app bundle and every save. | SPEC §6.1, §12; MILESTONES M1 |
| 2026-10-14 | Review #6 | Current cash lives on the club (`clubs`); a season-end snapshot goes in `clubSeasons`. | The store table had no home for cash. | SPEC §12; MILESTONES M4 |
| 2026-10-14 | Review #7 | Engine tuned with all style modifiers neutral; each league then checked against target × its modifier (ENG2 ~2.5 goals is correct). Metric-to-modifier mapping added. | It was unclear whether targets applied pooled or per league. | SPEC §8.8, §14; `calibration_targets.json` → `_note`, `leagueChecks`; MILESTONES M2 |
| 2026-10-14 | Review #8 | Set Pieces rating = the taker's delivery quality (`stp`) only; Aerial counts once in the set-piece matchup. | Aerial was counted twice (inside Set Pieces and again in the matchup). | SPEC §8.2; `formations_tactics.json` → `teamRatings.setPieces`; MILESTONES M2 |
| 2026-10-14 | Review #9 | Dev multiplier applies to growth only and blends to neutral between 23 and 27; decline = age × Medical dial; small positive mental minutes bonus at any age. Unit test: a benched 33-year-old doesn't decline slower than a starter. | The old formula multiplied decline by dev, so benched veterans declined slowest; "fading to nothing" would have stopped all change after 27. | SPEC §5.3; MILESTONES M3 |
| 2026-10-14 | Review #10 | GER1's lowest board target is "finish above the bottom 3". | "Avoid relegation" is meaningless while GER1 has no relegation. | SPEC §6.5; `competitions_mvp.json` → GER1 `_boardNote`; MILESTONES M4 |
| 2026-10-14 | Review #11 | Season 1 German cup preliminary round uses the 4 lowest-`strength` clubs. | "Lowest-placed last season" doesn't exist in season 1. | SPEC §2.1; `competitions_mvp.json` → `GERCUP.preliminary`; MILESTONES M3 |
| 2026-10-14 | Review #12 | Play-off dates: midweek eliminators after the final round; semis over a weekend + midweek; final around 23–25 May (weekend slot nearest 24 May). | No play-off dates were specified. | SPEC §2.1; `competitions_mvp.json` → ENG2 `playoff.schedule`; MILESTONES M3 |
| 2026-10-14 | Review #13 | Confirmed: if fewer than 16 seniors are fit, academy players aged 16+ fill the bench (same rule as default B6). | `minSeniorForMatch` was in config but not in the spec. | SPEC §7.1; `competitions_mvp.json` → `rosterRules`; MILESTONES M3 |
| 2026-10-14 | Review #14 | Season stat rows are kept forever unless the player is pruned. | "Kept forever" contradicted pruning, which deletes stat rows. | SPEC §12; MILESTONES M3 |
| 2026-10-14 | Review #15 | Confirmed as specified: renewals only in the windows, no end-of-season re-sign phase; expiring players must be renewed by 31 January or leave on 1 July; AI follows the same rule. Made visible: January inbox warning listing every player in his final six months, a reminder before deadline day, contract-expiry badges on the Squad page. | Big difference from ZenGM's re-sign phase, so it needed confirming and surfacing in the UI. | SPEC §3.1, §7.6, §11; `competitions_mvp.json` → `renewals`; MILESTONES M4, M5 |
| 2026-10-14 | M1 plan | The development core (age curves, dev multiplier, growth/decline) moves from M3 into M1; M3 wires it into the season and calibrates it. M1 also adds a developer-only generation inspector page and `pnpm generate --check`. Name and birthplace files come from Wikidata (CC0). | POT (an M1 deliverable) is computed from simulated career arcs, which need the development formula. The page lets T test M1 in the browser. | MILESTONES M1, M3 |
| 2026-10-14 | M2 plan | Substitutions follow the real rule: 5 in normal time in at most 3 windows (half-time free); extra time adds a 6th sub and a 4th window (free before extra time and at its half-time); no replacement once used up; no concussion subs. M2 adds a developer-only Match lab page; season targets are reported in M2 and gated in M3; engine coefficients live in code, overridable by the harness. | The spec said only "5 substitutions per match"; T chose the real rule. The page lets T test M2 in the browser. | SPEC §7.1, §8.5; `formations_tactics.json` → `substitutions`; MILESTONES M2 |
| 2026-10-14 | M2 chunk 2 | No Auto option. Simulated matches: the AI makes in-game changes for every club, the user's included, and picks his club's pre-match tactics too (confirmed by T). Watched matches: the user makes his club's in-game changes and sets its pre-match tactics. | The spec didn't say what happens to the user's club in simulated matches; T decided the AI handles them and the user manages the matches he watches. | SPEC §8.3, §8.5, §9, §11; MILESTONES M6 |
| 2026-10-14 | M2 chunk 4 | The parity target (top-6 losing to bottom-6, 13–22%) moves from the M2 gate to M3, with the other season targets. M2 reports it (ENG1 11.6%). | M2's harness plays full-strength XIs every match with no rotation, fatigue or injury lists; those cause many real upsets and arrive in M3. Tuning parity harder in M2 pushed the ENG1 champion below 82 points. | MILESTONES M2, M3; `tools/calibrate` |
| 2026-10-14 | M3 plan | League tie-breakers defined: points, goal difference, goals scored, head-to-head points, head-to-head goal difference, seeded draw; each league sets its own order in config. Awards are worked out and saved at season end in M3 (pages in M5). Until M4, contracts roll over and AI clubs top up to 22 seniors each preseason from their academy, then from free agents. Promoted-club survival and the finance checks of the 20-season run are gated in M4. M3 adds a developer-only Season lab page. | The spec named tie-breakers without defining them, and no milestone owned awards. Without contracts and transfers (M4), a 20-season run would empty squads. Promoted clubs can't strengthen without transfers. | SPEC §2.1; `competitions_mvp.json` → `tieBreakers`; MILESTONES M3 |
| 2026-10-15 | M3 chunk 4 | Injuries also happen in training between matches, with the same risk formula once per day (that day's condition, Medical dial, Injury Prone). | With in-match injuries only, squads averaged ~1.9 injured at once against a target of 2–4.5. Raising the in-match rate would have meant unrealistic numbers of injury substitutions; in real football about half of injuries happen in training. | SPEC §8.4; MILESTONES M3 |
| 2026-10-15 | M3 chunk 5–6 | The opening world starts in the shape the season loop settles at: 9–12 academy players per club, aged 15–17 (was 4–6, aged 15–18), and ~190 just-released 18-year-olds added to the free-agent pool. Club players ~2,100 (M1 check now 1,922–2,232). | With the spec's youth intake (3–6 a year, 2–3 years in the academy), active players rose ~35% over the first seasons before levelling off, failing the ±10% stability target. T chose to match the opening world to the steady state (option B). | SPEC §2.1; MILESTONES M1; `generate/squad.ts`, `generate/freeAgents.ts`, `generate/checks.ts` |
| 2026-10-15 | M3 chunk 7 | Development training base lowered from 0.4 to 0.2: dev = coaching × (0.2 + 0.8 × minutesFactor × challengeFactor) + performanceAdj (academy players: coaching × (0.2 + 0.8 × youth factor)). | With 0.4, a young regular (≥50% of minutes) grew only ~1.7× as fast as a benched one, so +4 to +8 a year for regulars and 0 to +2 for benched players couldn't both hold. | SPEC §5.3; `DEV.trainingBase` |
| 2026-10-15 | M3 chunk 8 | The well-played 18–21 growth target (+4 to +8 a year) is reported in M3 and gated in M4, together with world-shape checks: a stable senior OVR distribution and a peak around 27–29. | After tuning, 16 of 17 season-loop checks passed; settings that pushed young regulars past +4 also broke the wonderkid rate and inflated the top end. Transfers and loans (M4) change who plays young. | MILESTONES M3, M4; `tools/calibrate/world-report.ts` |
| 2026-10-16 | M4 plan | Opening squads carry notional past transfer fees, about 30% of squad cost, with wages about 70% of the M1 levels; squad cost stays 50–65% of revenue. TV pools and shares, and cup prize money per round, are set per league and per cup in config. The AI never acts for the user's club. M4 adds a developer-only Club lab page. | Per-player wages ran ~2× real-world because the whole wage budget went to ~23 players with no past fees. The spec gave no TV or prize amounts. | SPEC §6.2, §6.3; MILESTONES M4; `competitions_mvp.json` |
| 2026-10-18 | M4 chunk 3 | Contract years count by window: a summer deal's first year is the current season; a January deal's years start next season, the half season on top. A renewal must extend the contract. | SPEC §7.6 said only "1–5 years". Counting a renewal's years after the current season would have allowed 6-season deals in summer. Approved by T. | SPEC §7.6; `market/market.ts` (`contractEnd`) |
| 2026-10-18 | M4 chunk 4 | Mood gains a small ambition penalty: a player clearly better than his club (more than 6 OVR above its best-XI level, young players credited with half their headroom to POT) loses up to 0.1 mood (0.2 with Fame or Winning). The gap counts only as far as stronger clubs exist. | T asked that good, young or ambitious players be harder to keep, but very subtly, so talent doesn't drain to the big clubs. Over 20 seasons it moves top-six parity by about 0.5 points (within noise). | SPEC §4.6; `market/market.ts` (`MARKET.mood.ambition`) |
| 2026-10-19 | M4 chunk 8 | New 20-season targets in `calibration_targets.json`: median wages 35–65% of revenue every season, transfer fees 5–45% of revenue, senior mean OVR within ±1.5 of season 1, the 75+ share within ±1.5 points, and 27–29s rated at least as high as younger bands. The squad cost ratio (50–68%) must hold every season. | MILESTONES M4 asked for a stable world and plausible wages and fees without numbers. Approved by T. | `data/config/calibration_targets.json`; `tools/calibrate/world-report.ts` |
| 2026-10-19 | M4 chunk 9 | Parity is fixed mainly with match randomness (rating gaps decide each step a little less), plus a little more rotation by big clubs; the transfer market isn't damped. | With AI transfers, upsets fell to ~10% (target 13–22%), while the top/bottom strength gap stays near the opening world's. T's choice (options A, then B). | SPEC §8 (engine coefficients); `engine/coefficients.ts`, `season/coefficients.ts` |
| 2026-10-19 | M4 chunk 10 | ENG1 champion points target 90 (82–100) → 84 (76–100) for the MVP. | With stable stars, a later peak and realistic parity, talent spreads evenly and the champion averages ~78–80 points. Real 85–90-point champions come from money concentration, much of it European, which is out of MVP scope. Revisit when Europe is added. Approved by T (option A). | `calibration_targets.json` perSeason |
| 2026-10-19 | M4 chunk 10 | Players beating their displayed POT: target 25% (18–32%) → 20% (14–30%). | With more ceiling room for prospects, released and stalled young players fall short of the forecast; measured 15.8%. Approved by T. | SPEC §4.4; `calibration_targets.json` development |

## M0 notes (2026-10-14)
**Built**
- Toolchain: Node 24, pnpm 12.11.2 (via corepack), Vite 8, React 19, TypeScript 6.0 (strict + `noUncheckedIndexedAccess`), Bootstrap 5.3, Vitest 5, ESLint 10 + typescript-eslint (type-aware rules), Prettier.
- Typed UI↔worker bridge: `src/common/api.ts` (the contract), `src/common/rpc.ts` (transport-agnostic calls + broadcasts), `src/ui/workerClient.ts` (`toWorker`, `onWorkerEvent`), `src/worker/index.ts` (entry).
- SharedWorker with dedicated-Worker fallback; in fallback mode a Web Lock allows one active tab, others see "open in another tab". `?worker=dedicated` forces the fallback for testing.
- Storage: one IndexedDB database per league (`league-<id>`, `meta` store only for now), a global `soccer-sim-game` database listing saves, and an in-memory cache with dirty tracking and a single-transaction `flush()`.
- Seeded RNG (`src/worker/core/random.ts`): sfc32, string seeds, saveable state, `fork(label)` streams.
- Lint rules that enforce the architecture: `Math.random` banned in `src/worker`, `src/common` and `tools`; `src/ui` cannot import from `src/worker`.
- `pnpm calibrate` stub runs the core RNG in Node. Lean GitHub Action (lint, test, build, calibrate) on every PR and on pushes to main.
- Throwaway plumbing page (replaced in M5): worker type and tab count, IndexedDB counter, seeded rolls, persistent-storage status, deep-link test.

**Verified locally**
- 33 unit tests (RNG determinism, state save/restore, forks, distributions; RPC calls, errors, broadcasts; cache persistence, deletes, flush during flush; league DB registry).
- Headless Chrome against both `pnpm preview` and `pnpm dev`: 15/15 checks passed. Covered: SharedWorker in use; counter survives a reload and a full browser restart; two tabs share state live; the tab count updates on open and close; same seed gives the same rolls; a deep link loads; the fallback works and blocks a second tab; no console errors.

**Judgment calls (not spec deviations)**
- TypeScript 6.0 instead of 7.0: typescript-eslint doesn't support TS 7 yet (peer range `<6.1`). Revisit when it does.
- RNG `fork(label)` derives from the seed and label, not from the parent's current position, so each match's randomness is independent of sim order (groundwork for M2's pause/resume check). Labels must be unique per purpose.
- Persistent storage is requested by a button rather than on page load, because Firefox shows a permission prompt. For the real game: request it when a league is created (M1/M5).
- pnpm 12 blocks dependency install scripts by default; `esbuild` (used by `tsx`) is allowed in `pnpm-workspace.yaml`.

**Hosting**
- Cloudflare Pages project `soccer-sim-game` connected to the GitHub repo (T, 2026-10-14): production branch `main` → https://soccer-sim-game.pages.dev; branch previews at `https://<branch>.soccer-sim-game.pages.dev`. Build command `pnpm build`, output `dist`, no framework preset.
- The Pages build image defaults to pnpm 10, so the project sets `PNPM_VERSION=12.11.2`. **Bump it whenever `packageManager` in `package.json` changes.** Node comes from `.nvmrc`.

**Acceptance**
- Deployed check on the branch preview (https://m0-scaffold.soccer-sim-game.pages.dev): 15/15 headless Chrome checks passed; T confirmed. Accepted by T on 2026-10-14.

## M1 notes (2026-10-14)
**Built**
- Save schema for all 12 stores of SPEC §12 (league DB v2, with indexes) and a save list (global DB v2, which also removes the M0 demo save). The cache now handles compound keys (club-seasons are keyed by `[cid, season]`).
- Typed, validated config loaders. `based_on` is blocked three ways: the club loader copies only game fields; the build ships only `leagues` and `clubs` without `based_on`, in both the main and worker bundles; `pnpm build` fails if the field, or any of the 53 real names that aren't also cities or people's names, appears in `dist/`. The save is checked the same way.
- Names: 41 nationality files from Wikidata (CC0), `data/names/SOURCES.md`, re-runnable `tools/names/build-names.ts`.
- OVR: weighted means plus fixed per-position scaling, fitted once by `tools/fit-ovr-scaling.ts` and stored in `ratings_positions.json` (scale 0.95–1.11, offset −7.9 to +4.3).
- Development core (pulled forward from M3, approved), POT (20 arcs, 75th percentile, minutes expected from the player's standing at his club), best-XI slot assignment (exact Hungarian method).
- Generators: players (position rating profiles, height/weight, foot by side, traits, curve type, ceiling by age); squads (seeded default formation, 3 GKs, a backup per slot with 15% at a neighbouring position, tuned to `strength`); contracts and wages; 120 free agents; academies; the whole world as a pure function of the seed.
- League create/open/delete in the worker; a generation inspector page (developer-only, replaced in M5); `pnpm generate --check` (also in CI).

**Results** (seed "report")
- 1,737 club players (1,422 senior, 315 academy), plus 120 free agents.
- Worst best-XI gap to `strength`: 0.36.
- 75+: 2.7% of seniors. 50–65: 63.7%.
- Squad cost 50.0–64.6% of revenue. 24.1% left-footed. 13.5% of seniors start in their final contract year.
- Generation takes 0.7 s in Node and about 1.3 s in the browser, including writing the save (after computing age curves once per group instead of per rating; the world is byte-for-byte identical).

**Verified locally**
- 71 unit tests, including OVR, generator, development (benched 33-year-old vs starter), POT, assignment, cache keys, a save round trip, and the M0 → M1 upgrade.
- `pnpm generate --check`: 11/11.
- Headless Chrome on the production build: 18/18. Covered: create, reopen after reload, per-league tables, squads, live updates across two tabs, deleting a save, random seeds, deep link, no real club names on the page, no console errors. Seed "browser" produces exactly the XI that Node generates.

**Judgment calls (not spec deviations)**
- "Few 75+" checked as 1–6% of senior players, "many 50–65" as ≥ 50%.
- 120 free agents; Injury Prone 10%, Hothead 8%; mood traits 0/1/2 at 35/45/20%; equal default-formation weights.
- Opening squad cost is all wages (no past transfer amortisation), as approved.
- Budget dials start at 50 (typical) for every club; ticket price and opening cash are provisional until M4.
- Development and POT coefficients are provisional until the M3 calibration.
- A player's listed position is whatever he's best at, which can differ from the role he was generated for (e.g. a wing-back starting at wide midfield).

**For later milestones**
- **M4 (wages):** per-player wages run about 2× real-world levels (top €67M/yr, median €2.7M). Club wage bills are realistic, but the whole 50–65% budget goes to ~23 players, where real clubs split it with transfer amortisation and bigger squads. Options: a lower wage share plus opening amortisation. T to decide at M4.
- **M3 (youth):** opening academies hold 17 POT-75+ prospects across ~4 age groups (ENG1 9, GER1 5, ENG2 3), a little rich against "~1 wonderkid per league per season". Tune with the youth intake.
- **M3 (performance):** POT arcs still dominate generation time. If development updates need the time, precompute the age curves as lookup tables.
- **CI:** GitHub runners are ~3× slower than a local Mac. World-generating tests carry explicit 60 s timeouts; long runs belong in `pnpm calibrate`, not `pnpm test`.

## M2 notes (2026-10-14)
**Built**
- Match engine in `src/worker/engine/`, run possession by possession: build-up or long ball → progression → chance → shot with xG. It covers fouls and cards, penalties, corners and set pieces, energy drain, in-match injuries, extra time, shoot-outs, aggregates and neutral venues.
- Substitutions follow the real rule: 5 subs in 3 windows, half-time free; extra time adds 1 sub and 1 window. AI in-game rules: planned windows, chasing or protecting a result, pushing for a winner, replacing an injured player or a sent-off keeper.
- AI pre-match tactics (mentality, pressing, directness) from the two teams' ratings and the league style.
- Match ratings centred by position. Full box score: team stats, key events, per-player stats.
- Resumable API: `startMatch → stepMatch(n) → applyChanges(subs/sliders/formation) → … → matchResult`; `simulateMatch` runs it in one go. `prepareMatch` turns saved clubs into match input (`watchedBy` makes the user's club manual).
- Calibration harness `pnpm calibrate [--matches N] [--seasons S] [--worlds W] [--seed X] [--check]`. Default run: a neutral sample of 10,000 matches over 3 generated worlds, then round-robin seasons per league. It also prints the Team OVR fit and the rating-centring values. CI runs it with `--check`.
- Match lab tab on the developer page (replaced in M6). Simulate any two clubs; Watch one possession every 120 ms, with Play/Pause, +1 possession and To the end; simulate 1,000 matches in the browser and compare them with all 19 per-match targets.

**Verified locally**
- 99 unit tests. They cover team ratings, stronger teams winning more, sliders working in the intended direction, the substitution rule, cards, extra time and shoot-outs, applying changes mid-match, and determinism (a match paused and resumed with no changes equals an uninterrupted one).
- `pnpm calibrate --check`: all gated checks pass, at 0.83 ms per match.
- Headless Chrome on the production build: Match lab 11/11 and M1 18/18. The Match lab checks:
  - box score with ratings;
  - same seed gives the same match;
  - pausing stops the clock;
  - a watched match, paused and resumed, is identical to the instant one;
  - 1,000 matches in the browser at 0.86 ms per match, 19/19 targets in band;
  - no real club names and no console errors.

**Calibration status** (`pnpm calibrate --seasons 4`, 3 worlds, 12 seasons per league):
- All 19 per-match targets pass on the neutral sample (~10,000 matches).
- ENG1, ENG2 and GER1 pass every style-scaled check (goals, xG/shot, conversion × chance quality; fouls, yellows, reds × foul rate).
- Speed: 0.84 ms per match.
- Parity (reported; gated in M3 per T): ENG1 top-6 losing to bottom-6 is 11.6% (band 13–22%). ENG2 is at 17.6% and GER1 at 14.1%.
- Season numbers (information until M3): ENG1 champion 82.8 pts, bottom club 28.7, top scorer 27.6 goals; top assists 22 (target 11–20, high).

**Structural changes found while tuning**
- **Team ratings are on the player-OVR scale.** `RATING_SCALE` is fitted by `tools/fit-team-ratings.ts`. Without it, the recipes drift apart as quality rises, and better leagues scored less.
- **Shooter, keeper and penalty factors are relative** to the teams on the pitch, not to fixed reference numbers.
- **Long balls compare team ratings** (aerial and passing vs aerial and defence) instead of raw height and pace. The AI's directness uses the same ratings.
- **Booked players foul less and get a little leeway** from referees. This fixes the excess of second yellows.
- **AI tactics:** underdogs go defensive only when clearly outmatched; level late on, the stronger side pushes for the winner.
- **Direct play** makes quicker but scrappier chances (`chance.directPenalty`).
- **The harness averages over 3 generated worlds,** so one world's random formation draw doesn't decide calibration.

**Key tuned coefficients** (`src/worker/engine/coefficients.ts`):
- Strength and home: rating slope 0.22 per 10 points; home advantage 0.09 log-odds.
- Chance creation: base −1.08; xG bases central 0.153, header 0.087, dribble 0.12, long shot 0.036; xG pressure 0.09; keeper 0.085.
- Fouls per phase: 0.04 / 0.063 / 0.086. Penalty share 0.038.
- Reds: 0.0019 per foul, 0.0038 in the final third.
- Rating centring by position: GK 6.39 … AM 6.86.

**Judgment calls (not spec deviations)**
- Injured players: an AI-managed club replaces him if the substitution rule allows; otherwise he goes off and the club plays with 10. On a club the user is watching, he plays on at his energy floor until the user makes the change (M6 adds the prompt).
- The Match lab uses the league's style when both clubs are in the same league, and a neutral style otherwise. Its 1,000-match batch is always neutral, so it can be compared with the targets directly.
- The possession target ("95% of team-matches between 30% and 70%") is checked as a share of team-matches.
- Clean sheets count for GK, CB, FB and WB players with 60+ minutes.

**For later milestones**
- **M3:** gate parity and the season targets with the real calendar, rotation, fatigue and injury lists. Bring top assists (22) into band. In-match injuries run at about 0.5 per team per match; tune them with the injury lists.
- **M5:** Team OVR still uses placeholder weights. The harness fits real weights (R² 0.18–0.31, defence weighted most); adopt them before M5 shows Team OVR.
- **M6:** the Watch screen replaces the Match lab. `applyChanges` and the event feed are ready for it.

## M3 notes (2026-10-14 to 2026-10-15)
**Chunk 1: calendar, league fixtures, tables** (`src/worker/schedule/`)
- `seasonCalendar(season)` dates every league round and cup round. Two slots a week: Saturday and Wednesday. Each config MM-DD date moves to the nearest slot, so the season keeps its shape whatever weekday a date falls on.
- League fixtures are a double round-robin, with clubs shuffled by the season's own random stream. No club plays three home or three away matches in a row. The two meetings of a pair are at least 16 rounds apart (18 clubs) and 22 apart (24 clubs).
- League tables use each league's tie-breakers from config. Head-to-head criteria use a mini-table of the clubs still tied; `draw` is seeded and stable.
- `pnpm calendar [--season Y] [--sim]` prints a season's calendar, and with `--sim` plays the league fixtures and prints the tables.
- 34 new unit tests. They check the calendar rules for 20 seasons (2026–2045), fixture fairness and the tie-breaker cases.

**Judgment calls (chunk 1)**
- A cup-final weekend is kept free of league rounds for every league in that cup. GER1's last date and the German cup final are both 22 May 2027, so GER1 ends on 15 May (the real league also finishes before its cup final). The English top flight keeps 15 May free for the English cup final.
- Earlier cup rounds are spread evenly across midweeks: from 10 days after the entrants' first league round to 4 weeks before the final, outside the winter break. 2026/27: English cup 19 Aug, 21 Oct, 16 Dec, 17 Feb, 14 Apr, final 15 May. German cup 9 Sep, 18 Nov, 10 Feb, 21 Apr, final 22 May.
- Spare weekends (ENG1 2, GER1 1) are spread evenly, like international breaks. ENG2's extra rounds (7, or 8 when Christmas Day is a Saturday) are spread through the season's midweeks, never on a cup midweek.
- No matches on 24 or 25 December.
- The second half of the round-robin is the first half with venues swapped, starting from its second round. A straight mirror gave some clubs three home or away matches in a row at the turn of the season.

**Chunk 2: cups, play-offs, promotion and relegation** (`src/worker/season/`)
- `createSeason` builds a season from the clubs' current leagues: every league fixture, plus the first round of each cup. As matches are played, `progress` draws each cup round when the previous one finishes and creates the play-off stages one after another.
- English cup: ENG2 clubs enter round 1 and ENG1 joins in round 2 (32 clubs). German cup: a preliminary round for the 4 lowest-placed GER1 clubs (lowest `strength` in season 1), then the last 16.
- ENG2 play-offs, 3rd–8th:
  - eliminators: 5th hosts 8th, 6th hosts 7th;
  - two-legged semi-finals: 3rd plays the lowest-seeded eliminator winner, 4th the highest; the higher seed hosts the second leg;
  - final at a neutral venue.
- Extra time and penalties apply in every knockout match and after second legs; the engine works out aggregates.
- `seasonOutcome` returns the tables, champions, cup and play-off winners and the moves between leagues; `applyMoves` and `finishesOf` set up the next season.
- `pnpm season [--seasons N] [--seed X]` prints each season: tables, both cups round by round, the play-off bracket, and who went up and down. One season is about 1,300 matches and takes 1.2 s in Node, world generation included.
- The season state is plain data. A test saves it as JSON mid-season, resumes it, and gets identical results.
- The config loader now reads cup entry rounds and the preliminary round from the existing config text (no data change). It refuses a config whose cup bracket doesn't reach one final, or whose promotion and relegation counts don't match.
- 7 new season tests (full 2026/27 season plus season 2) and play-off date tests over 20 seasons. 140 tests in all.

**Judgment calls (chunk 2)**
- Cup finals and the play-off final are at a neutral venue. Other cup ties, semi-finals included, are at the ground of the club drawn first.
- Cup ties between clubs of different leagues use neutral style modifiers; a tie between two clubs of the same league uses that league's style. Play-offs use the league's style.
- Each cup round is drawn as soon as the previous round is complete. A round with an odd number of clubs gives one club a bye (the current config never needs one).
- Ranking for the German preliminary round: last season's finish. A club that was in a lower league last season, or has no finish (season 1), counts as lowest; ties go to the weaker club.
- A play-off date that falls on a cup date moves to the next free slot of the same kind. It never happens with the current calendar.
- The config check also accepts a 4-club play-off format for future leagues.
- **Observed, for M4:** without transfers, promoted clubs mostly go straight back down (in a 3-season run: 0 of 3 survived after season 1, 1 of 3 after season 2). Their survival rate is gated in M4 (T, 2026-10-14).

**Chunk 3: phase machine, Play actions, saving** (`src/worker/league/game.ts`)
- Phases: preseason (1 July to the first match), regular season (every league, cup and play-off match), end of season (from the last match to 30 June). The end of season has two steps the user takes: "Proceed to promotion/relegation" (moves the date to 1 June) and "Advance to preseason" (1 July, a new season).
- Play actions run in the worker: `untilNextMatch`, `oneWeek`, `untilWindowCloses`, `untilEndOfSeason`, `proceedToPromotionRelegation`, `advanceToPreseason`. They're reached through the new calls `getGameState` and `playGame`; a `gameChanged` event updates every open tab. Actions on one save run one at a time.
- Dated events: both transfer windows opening and closing, and the winter development date (its work arrives in chunk 5). The game date is the last day processed; each action processes days in order and saves once at the end.
- Saved per match:
  - the fixture result;
  - a match record (box score, key events, team and player stats, ratings; no play-by-play);
  - per-competition player stats (31 totals, including a rating total for averages).
- Club-season rows hold W/D/L, goals and points through the season, and the final position at the end.
- The cache keeps only the current season of fixtures, match records and player stats in memory. A new season saves the old one, drops it from memory and prunes match records older than last season (the user's club's are kept forever).
- Saves from before M3 get their season set up when opened. No database version bump was needed (no new stores or indexes).
- Fixed: a cache loaded through an index was keying rows by the index value. Regression test added.
- 7 new tests:
  - a season played in one go;
  - the same season stopped, reloaded and continued, identical down to every player stat;
  - promotion and relegation, then the next season;
  - match-record retention;
  - an upgraded old save;
  - partial cache loading.
  147 tests in all.

**Judgment calls (chunk 3)**
- The `playoffs` phase is gone. The spec's phase table has no such phase, and ENG2's play-offs overlap the ENG1 run-in and both cup finals, so they run inside the regular season.
- No separate "Start season" action: "Until next match" from preseason plays up to the user's first match. The M5 Play menu can label it as it likes.
- Play-offs keep their own player-stats competition (`ENG2-PO`), separate from the league.
- **Test speed:** fake-indexeddb, used by the unit tests, rewrites a row in time proportional to the store's size, so saving after many short steps is slow in tests. The stop-and-resume test therefore reloads once, early. Real browsers use proper indexes; chunk 9 measures saving in Chrome against the 60-second season budget.

**Chunk 4: condition, injuries, rotation** (`src/worker/season/squads.ts`, `coefficients.ts`)
- **Condition** is saved with the date it was set (the player's last match) and recovers with rest: the gap to 100% shrinks by exp(−rate × days). Recovery is faster with endurance and the Medical dial, and slower past 29.
  - A full 90 minutes leaves a player at about 65–70%. He's about 90% four days later and about 96% a week later.
  - Only players who play are rewritten, which keeps saves small. Everyone is reset to 100% in preseason; long injuries carry on.
- **Injuries** come from the match engine, which is already tied to energy (which starts at condition) and the Medical dial. They're saved as `injury.until`, with a type by length (knock, muscle strain, ligament, serious). Injured players are never picked.
- **Matchday squad AI** (SPEC §9), used for every club in simulated matches, the user's included. It assigns players to slots by slot OVR minus penalties:
  - tiredness, weighted down in big matches and up when a bigger match comes within 4 days;
  - rest for the regular starters in matches that matter less than an ordinary league match;
  - a large penalty below 55% condition.
  The bench gets area minimums, then the best of the rest.
- **Importance:**
  - an ordinary league match is 1;
  - from 70% of the league season, 1.25 with something at stake (within 6 points of the title, promotion, play-off or drop line) and 0.85 with nothing to play for;
  - cup: early rounds 0.65, quarter-finals 0.9, semi-finals 1.2, finals 1.5;
  - play-offs 1.5.
- With fewer than 16 fit seniors, the best academy players aged 16+ fill the matchday squad up to 20.
- `pnpm season` now plays with the squad AI and prints the squad numbers. `--quiet` prints only the averages.
- 7 new squad tests:
  - recovery: rest, Medical dial, endurance, age;
  - match updates and the preseason reset;
  - injured players excluded;
  - more rotation in small games, less in big ones, more before a big match;
  - the academy rule;
  - importance.
  154 tests in all.

**First numbers** (6 seasons each on two seeds; development not in yet):
- top clubs' minutes share 0.81 and 0.83 ✓ (0.72–0.88);
- injured per squad at once 1.8 and 1.9 (2–4.5, low);
- injury lengths: 25% under a week, 63% 1–3 weeks, 12% 4+ weeks, 2% season-ending ✓;
- parity ENG1 12% and 9% (13–22%, low), ENG2 15% ✓, GER1 13% and 10%;
- ENG1 champion 83 and 89 ✓, bottom 26 and 28 ✓, top scorer 33 and 29 ✓, top assists 18 and 23.
Tuning is chunks 7–8.

**Training injuries** (T, 2026-10-15, option B): `trainingInjuries` makes one draw per fit player per day, from 1 July to the last match, with the engine's injury-risk factors and length distribution. Each day has its own random stream, so the result never depends on how days are grouped into Play actions (tested). With a base of 0.0017 per player per day, 4 seasons give:
- injured per squad at once 2.7 ✓ (was 1.9);
- 40% of injuries in training;
- injury lengths unchanged;
- ENG1 champion 78.8 (lower, for tuning).
Season sim time rose by about 0.5 s per season in Node.

**Judgment calls (chunk 4)**
- Injuries happened in matches only (ZenGM-like) at first. To reach ~3 injured per squad, T chose to add training injuries (2026-10-15; see Deviations).
- When fewer than 16 seniors are fit, academy players fill the matchday squad up to 20, not just up to 16.
- The squad AI keeps the club's saved formation; formation changes by the AI are not in the MVP spec.

**Chunk 5: development and squad turnover** (`src/worker/season/offseason.ts`, `runner.ts`)
- **Shared runner:** `runDays` is the day-by-day loop (training injuries → dated events → matches), used by the save (`game.ts` persists what it returns) and by the tools, so both run the same code.
- **Development** on 1 January and 1 July for every player not retired, using the M1 core and a per-player tally of minutes and ratings since the last update:
  - minutes share = his minutes / his club's match minutes in the half;
  - level = the average best-XI OVR of his league;
  - performanceAdj = (average rating − 6.6) × 0.15;
  - academy players develop on the Youth dial.
  Each update appends a ratings snapshot and recomputes POT from career arcs (POT = OVR from 29, as in ZenGM).
- **Ceiling decay** (1 July): 19–23-year-olds under 15% of the season's minutes lose 1–3 hidden ceiling points.
- **End of season** (1 June):
  - retirement odds rise from 32 (2%) to 38 (90%); keepers retire two years later;
  - ×1.6 under OVR 50, ×1.25 under 60, ×2 for free agents;
  - free agents 30+ unsigned for a season retire; free agents 23 or under unsigned for 12 months leave the game.
- **Preseason** (1 July):
  - contracts roll over (temporary until M4);
  - youth intake: 3–6 per club aged 15–16, by Youth dial and reputation, club-country nationality mix;
  - academy players 18+ are promoted (3-year contract, wage on the club's scale) or released; outstanding 17-year-olds are promoted early;
  - squad top-up to 22 seniors, academy first, then the free agent filling the thinnest area;
  - condition reset.
- **Awards** at the final whistle, per league: champions, Player of the Year (best average rating, 50%+ of league minutes), Golden Boot, Team of the Season (1-4-3-3 by listed position, 40%+ minutes). Also cup winners, play-off winners, promoted and relegated clubs.
- **Transactions** are logged for retirements, academy promotions, releases and free-agent signings.
- **Pruning:** retired 3+ seasons ago, peak OVR under 74, no award and under 50 appearances for the user's club: the player and his stat rows are deleted.
- Transactions and awards are cached for the current season only, like fixtures.
- 9 new tests (8 season-end, 1 pruning), and the save tests now cover awards, retirements, youth intake and development. 165 tests in all. The M1 development tests already covered the three M3 development checks.

**First numbers** (untuned; 6 seasons on two seeds, then 10):
- well-played 18–21s +2.4 OVR a year (target +4 to +8, low);
- benched +1.2 ✓;
- 33+ −4.1 ✓;
- wonderkids (POT 75+) 4.2–4.4 per league per season (target 0.5–1.8, high);
- retirement age mean 34, 70% between 33 and 37 ✓;
- parity ENG1 12–13%, ENG2 17% ✓, GER1 11–14%;
- top-clubs minutes share 0.79–0.80 ✓, injured at once 2.7 ✓.
- **Player count:** active players rise from 1,863 to about 2,500 by season 4 and hold there (+35%). The spec's academy flow (3–6 youths a year, 2–3 years in the academy) settles at about 12 academy players per club, while the opening world generates 4–6. Young released players also make the free-agent pool about 300, against 120 at the start. Question for T at the chunk 5 check-in.
- Speed: a season with development takes about 3.6 s in Node. Each development update takes 0.6 s, mostly POT arcs.

**Judgment calls (chunk 5)**
- Development level = the average best-XI OVR of the player's league, a stand-in for "opponents' average team OVR" until Team OVR weights are fitted (M5).
- POT is recomputed at both updates; from age 29, POT = OVR.
- The squad top-up also covers the user's club while there's no transfer market (M4).
- Free agents develop as if at a typical club with no minutes.

**Chunk 6: 20-season harness** (`tools/calibrate/world.ts`, `world-report.ts`)
- `pnpm calibrate --world [--seasons 20] [--worlds 3] [--seed X] [--check]` plays W generated worlds for S seasons, each in its own process, with the real season loop. The engine harness stays the default (`pnpm calibrate`, now `tools/calibrate/engine.ts`). `pnpm season` prints from the same per-world module.
- **Gated:**
  - per season: champion and bottom points, top scorer and assists (ENG1), injured per squad, injury lengths, parity, top clubs' minutes share;
  - development: well-played and benched 18–21s, decline from 33, wonderkids, displayed POT beaten, retirement ages;
  - stability: player count drift and distinct ENG1 champions.
  Promoted clubs' survival is reported only (gated in M4).
- **Readings of the text targets** (judgment calls):
  - "most injuries 1–3 weeks; ~10% 4+ weeks; rare season-ending" = at least 50% at 7–21 days, 5–20% at 28+ days, at most 5% at 120+ days;
  - "most retire 33–37; goalkeepers later" = at least 50% of retirements (players 30+) at 33–37, and keepers' mean age above outfielders';
  - "exceed displayed POT" = seniors aged 17–21 in the first 5 seasons whose later peak OVR beats the POT shown then (gated from 12 seasons).
- Speed: 3.0 s per season per process. 3 worlds × 20 seasons take 60 s wall time locally, so roughly 3 minutes on CI. POT is now recalculated once a year (1 July); on 1 January it only rises to meet OVR.
- 1 new smoke test (2 seasons, every metric finite, results survive JSON). 166 tests in all.

**First full run** (3 worlds × 20 seasons, untuned): 11 of 17 gated checks pass.
- **Pass:**
  - champion 84.2, bottom 28.2, top scorer 30.4;
  - injured 2.65 at once, parity 13.3%, minutes share 0.82, injury lengths;
  - benched 18–21s +1.3;
  - retirements 89% at 33–37 (keepers 36.5 v 34.8);
  - at least 4 different ENG1 champions per world.
- **Fail:**
  - top assists 21.6 (11–20);
  - well-played 18–21s +2.5 a year (4–8);
  - players 33+ −3.9 (4–7);
  - wonderkids 5.1 per league per season (0.5–1.8);
  - displayed POT beaten 3.8% (18–32%);
  - player count +43% from the start, although only 4.2% after season 4 (decision pending with T).
- Promoted survival 57% (M4 target 35–60%).
- `calibrate --world --check` joins CI once tuning passes (chunk 8).

**Chunks 7–8: tuning** (T's decisions B and training base 0.2 applied; all values are code coefficients)
- **Development** (`core/development.ts` `DEV`):
  - training base 0.2;
  - young-player growth ×3 up to 22, fading to ×1 by 26 (players in senior football only);
  - academy growth ×0.5;
  - decline ×1.5 from 33, phasing in from 31;
  - ceiling softness 8 and mental minutes bonus 0.35, both unchanged.
- **Ceilings** (`generate/player.ts` `CEILING_HEADROOM`): one rule for every generated player, headroom ~ normal(1.1 × (27 − age), 0.2 × mean + 1.5).
  - Was 2.2 per year with a 0.45 share, sized for the old, slower growth. With faster growth it let the world inflate (75+ share 2.5% → 14% in 10 seasons).
- **Youth intake** (`generate/youth.ts`): base quality 25 (was 28). "Talent" link: a youth's quality noise also adds 8 ceiling points per standard deviation, so the youngsters who earn minutes first are the ones with room to grow.
- **POT** (`core/potential.ts`):
  - career arcs now model ceiling decay, as the season loop does;
  - expected minutes refitted to what the rotation AI actually gives (players 10 points below their club's XI play ~5%, not ~19%).
  Before this, only ~4% of young players beat their displayed POT; now 32%.
- **Engine** (`engine/coefficients.ts`): assist shares by chance kind. A set-piece header is the taker's assist only half the time (flick-ons and second balls); this alone took top assists from ~21 to ~16. The assist skill power is now a coefficient, left at 2. The M2 per-match gates still pass (average rating 6.55).
- **Squad AI:** a league match against a clearly weaker side counts × 0.85 (big clubs rotate against small ones). The effect on parity is small.
- **Turnover fix:** free agents unsigned for 12 months now move on on 1 July. The 1 June check let them stay nearly two years.
- **Harness:**
  - `--overrides JSON` for in-memory tuning runs (A3 #3);
  - average OVR by age band and the 75+ share, for information.

**Result** (`pnpm calibrate --world`, 3 worlds × 20 seasons, defaults): 16 of 17 gated checks pass.
- champion 83.9, bottom 28.0, top scorer 32.5, top assists 18.6;
- injured at once 2.62, parity 13.8%, minutes share 0.83, injury lengths;
- benched 18–21s +1.43, 33+ −5.66, wonderkids 1.75 per league, displayed POT beaten 31.9%, retirements 93% at 33–37 (keepers 36.8 v 34.9);
- player count drift 8.3%, at least 4 different ENG1 champions;
- **well-played 18–21s +3.81 a year (target 4–8):** gated in M4, by T's decision C (2026-10-15).

For information:
- promoted clubs' survival 66% (M4 target 35–60%);
- senior mean OVR 57.0 → 54.7 over 20 seasons;
- 75+ share 2.6% → 6.4%;
- by age, the last season's 21–23s (57.2) are better than its 27–29s (56.1): players peak earlier than in real football.

**Why the last check is hard:** players who play aged 18–21 are, by selection, the ones closest to their ceilings. Settings that push them past +4 a year also raise the wonderkid count above 1.8 and inflate the top end. A grid over talent headroom, average headroom and youth quality, and a run with growth spread into the mid-20s, all traded one failing check for another. T deferred this check and the world-shape side effects to M4 (decision C). The 20-season check now runs in CI.

**Chunk 9: Season lab page** (`src/ui/inspector/SeasonLab.tsx`, `src/worker/views/seasonLab.ts`)
- **Season lab** tab on the developer page (replaced in M5).
  - The Play options for the phase, as buttons; the date, phase and open window; the user's next match.
  - League tables with promotion, play-off and relegation zones.
  - The latest matchday's results, both cups round by round, and the play-off bracket.
  - Injuries (per squad, the user's club, the worst squads) and the best academy prospects.
  - This season's transactions, and the honours and awards once the season ends.
  - Each action shows what it did and how long it took. A whole season from 1 July is timed against the 60-second budget.
  - Every open tab refreshes when the game moves on (`gameChanged`).
- New worker call `getSeasonLab(lid)`.

**Verified locally (end of M3)**
- 166 unit tests; lint; build (no real club names in `dist/`); `generate --check`; `calibrate --check` (M2 engine gates); `calibrate --world --check` (16 season-loop gates, 3 worlds × 20 seasons, 67 s).
- **Headless Chrome on the production build:** Season lab 19/19, Match lab 11/11, M1 18/18. The M1 squad-size check is now 31–36 rows, after decision B. The Season lab checks cover:
  - preseason on 1 July with the window open;
  - Until next match plays to the user's first match (15 Aug); One week moves to 22 Aug;
  - a reload mid-season carries on from the same date;
  - the rest of the season in 2.3 s, then awards, both cups and the play-offs complete;
  - promotion and relegation with retirements logged; Advance to preseason opens 2027/28 with the youth intake;
  - **a whole season, 1 July to the final, in 1.9 s in Chrome, saving included (budget 60 s);**
  - a reload at the end of the season keeps it;
  - no real club names and no console errors.
- Saving in the browser is fast: the slowdown seen with fake-indexeddb in unit tests doesn't occur with Chrome's IndexedDB.

**M3 judgment calls, all chunks:** see the chunk sections above. Coefficients are in `src/worker/core/development.ts` (`DEV`), `src/worker/generate/player.ts` (`CEILING_HEADROOM`), `src/worker/generate/youth.ts` (`YOUTH_QUALITY`), `src/worker/season/coefficients.ts`, `src/worker/season/offseason.ts` (`TURNOVER`) and `src/worker/engine/coefficients.ts`.

**Carried to M4:**
- young regulars' growth (+3.8 a year, target 4–8);
- world shape: stable OVR distribution and a peak at 27–29;
- promoted clubs' survival (66% now, target 35–60%);
- the finance checks;
- real contract expiry, replacing the M3 rollover and squad top-up.

## M4 notes (2026-10-16 to 2026-10-19)
**Chunk 1: revenue, expenses, cash flow** (`src/worker/finance/finance.ts`)
- **Config** (approved by T): each league has a TV pool, its equal share, a ticket price base and an attendance base. Each cup has prize money per round won plus a runner-up prize (`competitions_mvp.json`, `_financeNote`).
  - TV pools: ENG1 €2.9B (75% equal), ENG2 €260M (85%), GER1 €1.25B (45%).
  - English cup €100k–€2.4M per round; German cup €200k–€4.5M.
- **Revenue:**
  - gates at every home match (attendance × ticket price; none at neutral finals);
  - TV equal share in ten month-end instalments, August to May; TV merit by final position (linear) when the matches end;
  - cup prize money at once;
  - commercial income in twelve month-end instalments.
- **Commercial base:** set at league creation as the anchor minus the expected TV and gate income (at least 5% of the anchor). It scales with reputation from there, ~8% per point, fitted on the anchors. A single formula missed the extremes by 30–50%.
- **Costs at each month-end:** a twelfth of the wage bill, plus the four budget dials, each (3% + 11% × dial/100) of the season's budget base (last season's revenue; the anchor in season 1).
- **Bookkeeping:**
  - every flow goes to the club's cash and its season row's revenue and expense breakdown;
  - 30 June closes the books with a cash snapshot;
  - the next season's rows take last season's revenue as their budget base, and the AI's ticket prices are reset by reputation.
- **Opening contracts (T's decision):** 70% of the opening squad cost is wages; 30% is notional past fees, spread over each player's remaining contract years (`Player.feeBalance`). Players aged 20 or under carry no fee. Squad cost stays 50.3–64.8% of revenue (M1 check passes).
- The shared runner books gates, prizes, month-ends and merit, so the save and the harness use the same money code. The harness reports season-1 revenue against the anchors, the revenue mix, wages to revenue and cash (information until chunk 8).
- 9 new finance tests (prices, attendance, month-ends, merit, prizes, opening contracts, a full season against the anchors, balanced books, next season's budget base), and the save tests check the books. 175 tests in all.

**First numbers** (3 worlds):
- season-1 revenue against the anchors, mean (mean absolute error): ENG1 −2.0% (6.0%), ENG2 +0.3% (1.9%), GER1 −2.6% (9.5%; worst 42%, a club whose anchor is below its TV money alone);
- revenue mix: gates 17%, TV 31%, commercial 52%, prizes 0.3%. Commercial is high because the anchors include European income, which the MVP books as commercial;
- wages are 39% of revenue in season 1;
- cash builds up (median 41% of revenue after season 1, 96% after 3) until transfers spend it;
- over 20 seasons, median wages slide to 17% of revenue. M3's rollover keeps wages flat and cheap academy players replace veterans; chunk 3's contracts replace this.

**Judgment calls (chunk 1)**
- **Budget dials double as the clubs' running costs:** about 34% of revenue at the default dial of 50. The spec lists only wages, fees and dials as expenses, and without running costs clubs would bank ~50% of revenue every year.
- Neutral cup finals and play-off finals bring no gate receipts, only prize money (play-offs pay none).
- The AI sets every club's ticket price, the user's included, until the M6 screens let the user set it.

**Chunk 2: hype, reputation, dials, board, inbox** (`src/worker/club/standing.ts`, `board.ts`)
- **Hype** after every match: 2.2 × (points won − points expected), with expected points from the two squads' strength and home advantage (~26% draws between equals). Each match also closes 4% of the gap to the level reputation supports.
- **Reputation** at the season's end closes 12% of the gap to what the finish supports, plus 2 for a cup or the play-offs. The level per position is the league's starting reputation at that rank: finishing 5th is worth the 5th-highest starting reputation. Reputation feeds commercial income, ticket prices and the youth intake.
- **Facilities** close 15% of the gap to the Facilities dial each season and add up to 6% attendance.
- **AI dials** each preseason: 50 + 20 × (cash / budget base − 0.3), between 35 and 70. The user's club keeps the user's dials.
- **Relative dial effects:** costs follow each club's dials, but what they do (development, youth intake, injuries, recovery, facilities) follows `budgetEffect` = 50 ± the club's distance from the average club, as in ZenGM's expense levels. Without this, every AI club pushing its dials to 70 (cash piling up before transfers) raised wonderkids to 2.4 per league and cut parity to 12.9%. Both are back in band.
- **Board** (per-league targets in config, approved spec item):
  - preseason targets by squad strength rank (ENG1: 2 title, 4 top four, 8 mid-table, 6 avoid relegation; ENG2: 3 promotion, 6 play-offs, 15 mid-table; GER1: 1, 4, 7, 6);
  - confidence after every matchday from results against the target, money and hype, weighted 0.6 / 0.25 / 0.15. It blends from the season-start value as the league season progresses, and the next season starts halfway back to 60.
- **Sacking:** below 25 once a third of the season is played, or below 35 at its end. The user gets 1–3 seeded job offers from clubs with lower reputation, and play stops until he accepts one (new call `acceptJobOffer`).
- **Inbox** (cached, new calls `getInbox` and `markInboxRead`): the preseason target, a warning when confidence falls below 40, the sacking, and the welcome at a new club.
- The runner now keeps W/D/L, points and the final position in the club-season rows (for the harness too), and closes each season with merit money, the board's verdict, reputation and facilities.
- The Season lab shows the board target, confidence, hype, reputation and cash, a "you've been sacked" banner with job offers, and the inbox.
- 10 new tests (hype, reputation, facilities, relative dials, AI dials, targets, confidence, sacking, job offers, preseason board), a save test that sacks the user and takes a job, and 2 new Season lab browser checks (21/21). 186 tests in all.

**Numbers** (3 worlds × 20 seasons, all M3 gates pass):
- boards would sack 0.6% of managers mid-season and 12% at season end;
- 60% of clubs meet their target; average confidence 65 at season end;
- hype averages 52 and spans 84 points;
- reputation stays stable: ENG1 69.5 → 68.5, ENG2 45.4 → 47.7, GER1 65.4 → 66.2.

**Judgment calls (chunk 2)**
- Mid-season sackings are rare because confidence blends from its season-start value; the harness reports them for tuning in chunks 9–10.
- The user's own budget dials are kept as he set them; the M6 screens will let him change them.

**Chunk 3: market value, mood, contracts, renewals, expiry** (`src/worker/market/market.ts`, `renewals.ts`)
- **Market value** (derived, never stored): €40M × exp(0.16 × (rated OVR − 75)), where rated OVR credits young players with 60% of their headroom to POT (full to 21, none from 27).
  - From 29, × 0.85 per year older.
  - By contract years left: 0.25 (expired) / 0.6 (one year left) / 0.85 / then 1.
  - ±15% for form; × exp(0.06 × (league level − 70)), where league level is the average best-XI OVR.
- **Wage demand:** the going wage fitted on the opening contracts, €5.62M × exp(0.108 × (OVR − 65)) × (club revenue / €200M)^0.289, × 0.44 / 0.64 / 1 / 0.92 for ages up to 20 / 21–23 / 24–30 / 31+. The residual spread is 22%.
  - A length he doesn't want: +5% per year away from his preferred length (4 years up to 24, 3 to 29, 2 to 32, then 1).
  - Final year: +10% (SPEC §3.1).
  - Mood: × (1 − 0.15 × mood). "Money" players: +10%.
- **Mood** (−1 to 1, ZenGM-style): team success (the board's results score), hype, facilities, market size, playing time and loyalty (years at the club). Each trait doubles its components: fame → market, hype and playing time (SPEC §4.5), loyalty → loyalty, winning → success. Below −0.6 he won't negotiate.
- **Contract lengths:** a summer deal counts this season as its first year. A January deal's years start next season, with the half season left on top ("two and a half years"). A renewal must run past the current contract.
- **The contract year** (replaces M3's rollover):
  - 1 July: contracts that ended on 30 June expire, and the players become free agents. A transaction is logged, and the user's inbox lists who left.
  - The AI renews when a window opens: in summer, final-year players and regulars (top 11) with two years left; in winter, final-year players.
    - It keeps its best 18 by OVR, plus prospects (23 or under, POT within 3 of its XI). Players 32 or older are kept only if in its best 14, on short deals.
    - The player must be willing. The wage bill must stay within 55% of revenue, except for the best eleven (see judgment calls).
  - The AI never acts for the user's club (T, 2026-10-16).
  - The user's inbox: the January list of players in their final six months, and a reminder the day before deadline day.
- **API:** `getContractTalks(lid, pid)` returns mood, market value and the ask per length with its end date. `renewContract(lid, pid, years)` renews the user's own players, only in a window, only if the player is willing, and only if the contract is extended. The Club lab page (chunk 11) will use both; until then the user's players expire unless renewed through the API.
- `signContract` re-spreads any unamortised fee over the new length (SPEC §6.3).
- The harness reports expiries, renewals, top-up signings and the free-agent pool. Overrides now cover finance, standing, board, market and renewals.
- 10 new market tests (value, wages, mood, asks, contract lengths, fee re-spread, expiry, AI renewals, warnings) and a save test for renewals (window, own players, extension). The save tests also check the January warning, the reminder and expiry on 1 July. 196 tests in all.

**Numbers** (3 worlds × 20 seasons; 6 worlds in brackets):
- per club a season: 1.5 contracts expire, 11 renewals, 0.2 top-up signings;
- median wages / revenue stays at 41% → 50% (52%), instead of sliding to 17% under the rollover;
- clubs with negative cash rise to 8% (6%) by the last season, until AI budgets (chunk 4) and FFP (chunk 7);
- squad age shape improves, because clubs now let unwanted veterans go: senior OVR by age after the last season is 18–20: 46.7, 21–23: 60.2, 24–26: 63.3, 27–29: 62.2, 30–32: 59.7, 33+: 54.1. Under the rollover, 21–23 rated above 27–29.
- **M3 gates on the edge.** Contracts move several M3 gates that were already near their limits:
  - With 3 worlds (the CI run), three fail: ENG1 champion 81.6 points (floor 82), top assists 20.2 (cap 20), and players beating their displayed POT 32.3% (cap 32%).
  - With 6 worlds, only the POT check fails, at exactly 32.0%. Chunk 2 measured 29.5% with 6 worlds: veterans leaving gives young players more minutes than their POT forecast assumes.
  - Parity: top six losing to the bottom six was 14.2% (6 worlds) after chunk 2. It fell to 12.6% with the 55% wage cap on all renewals, and is 13.1% (13.3%) with the best-eleven exemption.
  - Transfers (chunks 4–5) will change squads again, so these gates are tuned in chunks 9–10. The branch is pushed only when every gate passes.

**Judgment calls (chunk 3)**
- **The best eleven are re-signed whatever the wage bill,** as ZenGM lets teams go over the cap to re-sign their own players. With every renewal under the 55% cap, weaker clubs lost regulars they wanted and parity fell.
- **Contract lengths** count as above, approved by T (2026-10-18) and added to SPEC §7.6. Counting a renewal's years after this season would have allowed 6-season deals in summer.
- Mood's "success" component is the board's live confidence, so a club doing better than expected is attractive.
- Final-year players pay the 10% premium in both windows; the AI renews regulars in summer with two years left, to avoid that premium.
- An expiring player's fee balance is cleared. Yearly amortisation, and the write-off of any balance left, is booked with FFP in chunk 7.

**Chunk 4: transfers I** (`src/worker/market/transfers.ts`, `src/worker/league/market.ts`)
- **Ambition in mood** (approved by T, kept subtle; see Deviations). Without it, a star at a small club was as happy as anyone there.
- **Strategy:**
  - contending when the board's target is fourth or better (ENG1 title and top four, GER1 title and top four, ENG2 promotion);
  - selling with negative cash or a squad cost above 70% of the budget base;
  - otherwise developing.
- **Budgets** (SPEC §6.3):
  - The FFP headroom is 70% of the budget base less wages and the year's fee amortisation.
  - One control (`Club.wageShare`, default half) splits the headroom between wage room and fees. A fee counts against the headroom spread over four years.
  - The transfer budget is also capped by cash, less a 10% reserve, plus half the projected profit. Negative cash freezes transfers.
- **Asking price** (SPEC §7.3) = market value × importance × strategy × an unhappiness discount:
  - Importance by squad rank: starters ×1.3, ranks 12–16 ×1, ranks 17–22 ×0.8, the rest ×0.6.
  - Strategy: a contender wants ×1.2 more for a starter in summer and ×1.5 in January. A developing club wants ×1.2 for players 23 or under and takes ×0.85 for those 30 or over. A seller takes ×0.9.
  - Unhappiness: up to 15% off when the player's mood at the club is negative.
  - Market value is exponential in OVR (×5 per 10 points), so two average players' fees never buy a star (exploit test).
- **The deal** (two steps):
  1. The selling club accepts a bid at its asking price, counters from 80% of it (naming its price), and rejects anything lower.
  2. The player agrees terms at his ask for the chosen length, with his mood toward the buying club. Expected minutes come from where he'd rank in the new squad.
  - The fee is paid up front, the seller books it as player sales, and the buyer amortises it over the new contract.
  - Player sales stay out of the next season's budget base (`operatingRevenue`).
  - A new signing gets the lowest free shirt number.
- **Your side** (worker API):
  - `getContractTalks` now covers renewals, transfers and free agents, with your transfer budget and wage room.
  - `bidForPlayer` makes a bid; `signPlayer` agrees personal terms; `respondToOffer` accepts or rejects a bid for your players; `getOffers` lists bids.
  - Bids live in the save's offers store and lapse once deadline day is played. They're kept for their season.
  - Signing needs an open window, a willing player, a wage within your wage room, a fee within your budget and a squad below 25 seniors.
  - Market actions run in the same queue as Play.
- 7 transfer unit tests (star-for-two exploit, importance and contract length, contender and seller pricing, bid thresholds, budgets and the cash freeze, ambition, completing a deal). 2 save tests cover the whole user flow: bid steps, signing, a free agent, rejecting and accepting a bid for your player, and bids lapsing at the deadline. 205 tests in all.
- AI buying and selling (chunk 5) will use the same functions; until then nothing makes the AI bid.

**Numbers** (3 worlds × 20 seasons; no AI transfers yet, so only ambition moves them):
- the same edge picture as chunk 3: champion 84.1 points ✓, assists 19.4 ✓, parity 12.98% (reported as 0.130, floor 13%), POT check 32.3% (cap 32%);
- with 6 worlds, ambition off against on: parity 13.8% against 13.3%, POT check 31.6% against 31.5%. All pass with 6 worlds.

**Judgment calls (chunk 4)**
- **Importance by OVR rank**, not by position: simple and close to ZenGM's value-by-rank. Position needs come with AI buying (chunk 5).
- **The user sees no asking price:** a counter reveals it once a bid is within 80%. ZenGM's trade screen likewise says only what the AI would accept.
- **Bids for your players** are answered by you. On acceptance the player agrees terms with the buyer at his preferred length, or the move falls through (an inbox message says why).
- **The wage room binds new signings only.** Renewals, yours and the AI's, are judged by FFP at season end (chunk 7), as in ZenGM, where teams can re-sign their own players over the cap.
- A seller's unamortised balance leaves with the player. Booking the profit or loss on a sale against that balance comes with FFP (chunk 7).

**Chunk 5: transfers II** (`src/worker/market/aiMarket.ts`)
- **Market days:** weekly in each window from a week after it opens (summer 8 July to 26 August, winter 8 to 29 January), plus deadline day. They're processing days in the shared runner, so the save and the harness run the same market. The squad AI regroups after every move.
- **AI buying by need** (from the club's best XI in its default formation):
  - under 22 seniors: fill the area furthest below its target (3 goalkeepers, 2 per formation slot elsewhere) with anyone fit for the squad;
  - otherwise: upgrade the weakest XI slot when it's more than 3 below the XI level, with a player at least 3 better there;
  - it looks no higher than its XI level + 6.
- **The choice:**
  - Candidates: the best 60 at other clubs and the best 15 free agents in reach.
  - Each must be affordable: fee within the transfer budget and at most what he's worth to the buyer (market value × 1.4, × 1.2 more for a contender); wage within the wage room.
  - The selling club keeps 18 seniors, and the player must be willing.
  - Score = his rating in the slot, plus half his headroom if he's 23 or under and the buyer is developing, minus 0.3 per 1% of the buyer's budget base the deal costs a year (fee over four years plus wage).
- **Limits:**
  - at most one move per club per market day, with a 50% chance to act;
  - at most 3 signings per club in summer and 2 in winter;
  - contenders buy no one over 31 except to fill the squad;
  - nobody buys beyond 25 seniors.
- **Bids for your players** go to your inbox as open offers (at most 2 at a time, one per player, none on deadline day). Accept or reject them with `respondToOffer`; unanswered bids lapse when the window closes. Bids for players the AI has since signed elsewhere are cancelled.
- **Free agents** (SPEC §7.5): asks start at 1.25 × the going wage and fall toward 0.6 × (63% of the gap every 60 days). A filler signing may pay up to 1% of the budget base even without wage room.
- **Top-up replaced:** each summer, AI clubs under 22 seniors still promote their best 17+ academy prospects first. Free-agent signings now happen in the market. Your club is never topped up.
- **Fix found by the stop-and-resume test:** open bids lapse by date inside the runner too. Before the fix, a long run kept summer bids "open" in memory into January, and a resumed run didn't.
- 5 AI market tests (market days, needs, AI-to-AI deals within the rules with money conserved and the same deals for the same seed, bids for your players, falling free-agent asks). The save test checks that a played season has AI transfers. 210 tests in all.

**Numbers** (3 worlds × 20 seasons):
- per club a season: 2.4 transfers, 0.3 free-agent signings, 1.5 contracts expiring, 11 renewals; transfer fees are 21% of revenue;
- money circulates: clubs with negative cash 1% (9% in chunk 4); wages 42% → 51% of revenue; cash still builds up (median 358% of revenue by the last season), because FFP headroom, not cash, caps spending;
- promoted clubs' survival is 49%, now in its band (it was 62–67%);
- seniors per club 23.4 → 22.0; free agents 245 → 333 after the summer; player count drift 7.6% ✓;
- a season takes 3.9 s (3.3 s before).
- **Parity falls to 11.3%** (floor 13%), and the POT check rises to 34.9% (cap 32%). Rich clubs buy upgrades:
  - ENG1's top-six XI averages 74.8 against the bottom six's 61.6, a gap of 13.2;
  - the opening world starts at a gap of 12.5 (from the real-club data);
  - without transfers (chunks 3–4), development narrowed it to about 10.5.

  The engine gives too few upsets for a realistic gap, as already found in M2 (11.6% at full strength). This is for T to decide in chunks 9–10: more match randomness, a stronger weak-opponent rotation, or damping the market.

**Judgment calls (chunk 5)**
- Market days are weekly, plus deadline day, rather than daily (ZenGM runs free agency daily). That's cheaper, and spreads deals through the window.
- Needs come from the best XI by slot, not from squad depth per position beyond the area targets. That's simple, and close to ZenGM's "fill the weakest starter" AI.
- Free agents are shortlisted separately: on rating alone, club players crowded them out, and no free agents were signed at all.
- The AI doesn't sell surplus players on its own initiative; buyers find them. Clubs at 25 seniors stop buying.

**Chunk 6: loans** (`src/worker/market/loans.ts`, `src/common/status.ts`)
- **Who a loanee belongs to:** he is registered with the loan club (status "loan", `cid` = loan club). He plays, trains and develops there, with its coaching and his minutes there. His contract, renewals, expiry warnings and transfer value stay with the parent (`contractClub`). Every squad, strength, training and development check now counts loanees where they play (`isSenior`).
- **Wages** are split by the loan's wage share (0, 50 or 100% paid by the loan club, the rest by the parent), in the month-end books and in squad cost and wage room. Fee amortisation stays with the parent.
- **Length:** season-long (to 30 June), or half a season from the summer (to 1 January). January loans run to the season's end. No recall, no option to buy.
- **Returns:** half-season loanees return on 1 January, after that day's development update. Season-long loanees return on 1 July, the first preseason step, before contracts expire. The user is told who is back.
- **A loanee can't play against his parent club** (filtered out of the matchday squad).
- **AI loans:**
  - **Listing:** a club lists young prospects who won't get minutes: 21 or under, outside its best 16, POT within 8 of its XI level. It must keep 20 seniors and have at most 4 out on loan.
  - **Taking (needs):** a club takes a listed player when he fills one of its needs and would rank in its best 14 (at most 2 loanees in).
  - **Placement:** each market day, every club with listed prospects tries to place its best (by POT) with the club at about his level (XI level from 4 below to 6 above his OVR) where he'd rank highest. The borrower pays half his wage if it has the room, otherwise the parent pays it all.
- **Your side:**
  - `proposeLoan(pid, cid, length, wageShare)` loans your player out to an AI club, or another club's player in.
  - An AI borrower takes him if he'd rank in its best 14, paying at most half (all for a player who'd start).
  - An AI lender lends a young player (23 or under for you) outside its best 16 who'd play for you, for at least half his wage.
  - Squad, loan and wage-room limits apply on both sides, and the player must be willing.
  - A loanee can't be bought; his parent renews him.
- **Harness fix:** the young players' development checks now count a player's minutes wherever he played, against the club he played most for. Before, loanees counted as benched at their parent club (the benched check read 2.5).
- 6 loan tests:
  - loan dates;
  - moving and returning, with the wage split;
  - who is listed;
  - a loanee never facing his parent, over a real half-season;
  - the weak-loan exploit: full minutes in a league 12 below him grow a player less than full minutes at his level, and both beat the bench;
  - AI loans in the market.

  A save test covers your loans out and in, refusals, a loanee not for sale, and a half-season loanee back on 1 January. 217 tests in all.

**Numbers** (3 worlds × 20 seasons):
- 0.3 loans per club a season (about 19 a season in the world), 2.2 transfers and 0.3 free-agent signings;
- young players' development: well-played 18–21s +3.96 a year (3.76 before; target 4–8, gated from chunk 8); benched +1.37 ✓;
- players beating their displayed POT rise to 39% (cap 32%), because players now move to where they'd play, while POT assumes their current club's minutes. That's for chunk 8's POT work;
- parity 11.0% (see chunk 5);
- 4.1 s a season.

**Judgment calls (chunk 6)**
- **Academy loans:** SPEC §7.2's "promote, loan or release" at 17–18 works as promote then loan. A promoted 18-year-old outside the best 16 is listed, and a loan needs a pro contract to split.
- **AI wage shares** of 50% (or 0% when the borrower has no wage room) stand in for negotiation. The user picks 0, 50 or 100%.
- **Placements** go to the club at about his level where he'd rank highest, so the challenge factor helps his development.

**Chunk 7: FFP with fee amortisation** (`src/worker/finance/ffp.ts`)
- **Amortisation:** each month-end writes a twelfth of every fee's yearly charge off the player's balance and books it to the club holding his contract (the parent for a loanee), as a non-cash item (`ClubSeason.amortisation`). Squad cost and budgets count only fees still on the books. A renewal re-spreads what's left, and a fully amortised balance is cleared.
- **Profit on sales:** the fee less the player's unamortised balance (`ClubSeason.salesProfit`, can be negative). The fee itself is still booked as player-sales revenue in cash, and kept out of the next budget base.
- **The 30 June check** (in `closeSeasonBooks`, so the save and the harness run the same code), for every club, the AI's included:
  - squad cost ratio = (wages + amortisation) / (operating revenue + profit on sales), stored in `ClubSeason.squadCostRatio`;
  - over 70%: a warning; over 70% while warned: a transfer ban until the next summer window's deadline day (`Club.ffp`);
  - a season within 70% clears the warning;
  - the user gets an inbox message for a warning or a ban.
- **A ban** stops all signings: transfers, free agents and loans in, for AI clubs (skipped as buyers, borrowers and loan homes) and for the user (bids, signings and loan-ins are refused). Selling and renewing are still allowed.
- **A warned AI club switches to selling** (its players come cheaper; see chunk 4).
- **Cash freeze** (SPEC §6.4): negative cash makes the transfer budget zero (from chunk 4), so no fees are paid. Free agents and loans within wage room are still possible.
- Contract talks now show the user's squad cost ratio against the limit, and any warning or ban.
- 4 FFP tests (monthly amortisation to the contract holder, profit on a sale, warning then ban then a clean season, a banned club out of the market and a warned one selling), plus save checks: every club's ratio set on 30 June, amortisation booked, and a banned user refused. 221 tests in all.

**Numbers** (3 worlds × 20 seasons):
- median squad cost 59% → 56% of revenue (target 50–68% ✓, gated in chunk 8); 8.9% of clubs over 70% a season, 2.0% banned;
- negative cash 1% → 2% ✓;
- 3.4 transfers per club a season, fees 33% of revenue. Counting only fees still on the books frees headroom.
- **Cash still piles up**, to a median of 390% of revenue by the last season:
  - transfer fees move money between clubs, so they can't drain the system;
  - wages (52%) and running costs (~34%, the dials at 70) leave a ~14% surplus a year.

  That's a tuning question for chunks 9–10 (wage levels, dial costs, or spending of cash).
- Parity falls to 9.9% with more deals (see chunk 5, T's decision at chunk 9); assists 20.1 (cap 20, noise).

**Judgment calls (chunk 7)**
- **The penalty ladder** follows SPEC's MVP default: a warning, then a ban for the next window (the summer), cleared by one clean season.
- **"Transfer ban" means no signings of any kind,** loans and free agents included, as in a real registration embargo. Sales and renewals are allowed.
- **A loss on a sale** (fee below the balance) lowers FFP revenue, the mirror of a profit.
- A balance left when a contract expires isn't written off separately: monthly charges run it down to zero over the contract.

**Chunk 8: M4 gates in the 20-season harness** (`tools/calibrate/world-report.ts`, `world.ts`)
- **Newly gated:**
  - young regulars' growth (well-played 18–21s, 4–8 a year);
  - promoted clubs' survival (35–60%);
  - and a new "Economy, market and world shape (M4)" section:
    - negative cash under 15% at every season end;
    - the median squad cost ratio within 50–68% in every season;
    - median wages within 35–65% of revenue in every season (proposed);
    - transfer fees 5–45% of revenue (proposed);
    - senior mean OVR within ±1.5 of season 1 (proposed);
    - the 75+ share within ±1.5 points of season 1 (proposed);
    - peak age: 27–29s rated at least as high as 21–23s and 24–26s in the last season;
    - the two exploit checks.
- **Exploit checks run on each world's final season**, so CI tests them on a mature world, not just the opening one:
  - each league's 3 best players against two league-level players' asking prices;
  - 30 young players (19–21, POT 6+ above OVR) given full minutes 12 below their level against at their level, 40 draws each.
  The unit tests (chunks 4 and 6) check the same on the opening world.
- **Proposed bands** (not yet in `calibration_targets.json`; T to approve before they move into data/): mean OVR drift ±1.5, 75+ share drift ±1.5 points, wages 35–65%, fees 5–45%.
- The report also prints squad cost and cash per season.

**First M4 report** (3 worlds × 20 seasons):

| Check | Result | Target | |
|---|---|---|---|
| clubsInNegativeCashShare (worst) | 5% | < 15% | PASS |
| medianSquadCostRatio (range) | 44–62% | 50–68% every season | FAIL (seasons 3–11 dip to 48–51%) |
| median wages / revenue (range) | 41–54% | 35–65% (proposed) | PASS |
| transfer fees / revenue | 32% | 5–45% (proposed) | PASS |
| senior mean OVR (last − season 1) | −1.4 | ±1.5 (proposed) | PASS (edge) |
| seniors rated 75+ (last − season 1) | +4.6 pts | ±1.5 pts (proposed) | FAIL |
| peak age | 27–29: 62.7 v 24–26: 62.9 | 27–29 at least as high | FAIL (edge) |
| exploit: star for two average fees | 0 of 27 | never | PASS |
| exploit: weak-loan development | 0 of 90 | none | PASS |
| promotedClubsSurvivalRate | 45% | 35–60% | PASS |
| wellPlayed18to21OvrGainPerYear | 3.98 | 4–8 | FAIL (edge) |
| exceedDisplayedPotPct | 39.2% | 18–32% | FAIL |
| top6LoseToBottom6Pct | 9.9% | 13–22% | FAIL (T's decision, chunk 9) |
| topAssists | 20.1 | 11–20 | FAIL (noise) |

All other M2/M3 gates pass.

**Plan for the tuning chunks (9–10)**
1. **Parity:** T's choice first (reminder saved): more match randomness, more rotation, or a damped market.
2. **Money:** clubs underuse their FFP room (squad cost dips under 50%) while cash piles up to 390% of revenue. Candidates:
   - AI clubs spend cash on wages and transfers more readily;
   - wage asks scale more with revenue;
   - running costs rise with cash.
3. **World shape:** too many 75+ seniors (+4.6 points); peak age a hair early; young regulars a hair slow. Development coefficients, and the transfer market's pull of stars to clubs where they play.
4. **POT forecasts:** players now move to where they play, so the displayed POT (current club's minutes) is beaten 39% of the time. The forecast should expect a talented player to find minutes.

**Chunk 9: tuning I — parity and money** (T, 2026-10-19: parity mainly with match randomness, plus a little more big-club rotation)
- **Form on the day** (new engine coefficient, SPEC §8.2): each team's seven ratings move by a normal draw (sd 6 team-rating points) for the whole match, from its own seeded stream.
- **Engine:**
  - slope 0.22 → 0.18 (rating gaps decide each step a little less);
  - chance base −1.08 → −1.14, which brings goals back to 2.79 (form raises scoring).
  - All M2 engine gates pass: draws 22.5% (they were 23.4% before; any per-match randomness makes results more decisive).
- **Rotation:**
  - `restRegulars` 8 → 14: low-stakes matches, such as early cup rounds and games against much weaker sides, see more rotation;
  - weak-opponent factor 0.85 → 0.8 (on its own it barely changes selection).
- **Money:** the going wage in contract asks rises 15% above the opening-contract fit (`MARKET.wage.at65` 5.62M → 6.46M). Clubs now spend their revenue, and higher wages leave less for transfers, so talent concentrates less.
- **Engine harness fix:** `pnpm calibrate --overrides` now applies to the engine harness too (it was ignored).
- **Every-season gates** average each season over the worlds, so they don't widen with more worlds.

| Setting (3 worlds unless noted) | Top six lose to bottom six | Champion points |
|---|---|---|
| Before chunk 9 | 9.9% | 87.7 |
| slope 0.14 | 12.6% | 83.6 |
| slope 0.18 + form 6 | 13.0% | 83.8 |
| + wages +15% | 14.9% | 83.7 |
| Committed (chance −1.14, rotation 14), 6 worlds | 14.4% | 82.6 |
| Committed, 3 worlds (CI) | 14.9% | 82.7 |

Each point of parity gained cost about one champion point, so the two real-world targets pull against each other with today's talent spread. Run-to-run noise is about ±1 point on both.

**Numbers now** (3 worlds × 20 seasons):
- all per-season, M3 and money gates pass:
  - parity 14.9%, champion 82.7, assists 18.3;
  - squad cost 54–64% every season; wages 44–61%; fees 25% of revenue; negative cash at worst 6%;
  - 2.5 transfers per club a season;
- cash builds up more slowly: median 240% of revenue by the last season (390% before);
- still failing (chunk 10):
  - young regulars' growth 3.94 (4–8);
  - beating displayed POT 38.8% (≤ 32%);
  - senior mean OVR −1.7 (±1.5);
  - 75+ share +4.9 points (±1.5);
  - peak age (27–29: 63.7 against 24–26: 65.0).

**Judgment calls (chunk 9)**
- Form on the day rather than only a lower slope: for the same parity it kept a little more of the champion's points and goals.
- More rotation went in through `restRegulars` (low-stakes matches) rather than the weak-opponent factor alone, which didn't change selection.
- Wages rise 15% rather than adding running costs: wages are the spend the M4 targets watch (squad cost, wage share), and they also ease talent concentration.

**Chunk 10: tuning II — development and world shape** (T decided the champion and POT targets, see Deviations)
- **POT minutes refit:** `expectedMinutesShare` is refitted to the minutes seniors actually get over the next season in the M4 world (rotation, injuries, loans and moves): floor 7%, cap 83%, midpoint 6.3 below the XI level, width 3 (`MINUTES_FIT`). Before, 10 below the XI meant ~5%; now ~25%, as measured. It's still the expected minutes at his current club (SPEC §4.4). Re-measured after the development changes, it still fits.
- **Diagnosis:**
  - All 75+ players after 20 seasons came from youth intake. Youth ceilings were too generous at the top: a talent bonus of 8 per sd.
  - Young regulars had only ~6 points of ceiling room (a quarter under 2): growth was front-loaded (×3 to 22) while ceilings allowed ~1.1 points a year to 27. So they hit their ceilings around 21 and peaked early.
- **Changes:**
  - youth talent headroom 8 → 2 per sd;
  - ceiling room 1.1 → 2.0 points a year to 27;
  - a soft cap on ceilings above 72, which keep half the excess (`CEILING_HEADROOM.softCap`);
  - young-growth boost ×3 → ×2.5.
- Harness: overrides now also cover the minutes fit, age curves, the AI market and transfers. The report prints champion points and parity per season.

**Numbers** (3 worlds × 20 seasons):
- **Now pass:**
  - young regulars +4.19 a year;
  - wonderkids 0.58 per league;
  - senior mean OVR −0.9;
  - 75+ share +0.0 points;
  - peak age (27–29: 64.8, 24–26: 64.6);
  - parity 16.8% (target 17%).
- **Still pass:** all M2/M3 and money gates.
- **Fail:**
  - **ENG1 champion 78.5 points** (band 82–100). It's low from season 1 (79), with talent spread more evenly. Over 20 tuning runs, every setting that held stars stable kept the champion at 78–82: rotation, randomness, contender spending and academy quality were all tried.
  - **Beating displayed POT 15.8%** (band 18–32%). The minutes fit matches reality, so the forecasts are slightly optimistic with more ceiling room.

**Chunk 11: Club lab, browser checks, handover**
- **Club lab** (developer-only tab, `src/ui/inspector/ClubLab.tsx`, worker view `src/worker/views/clubLab.ts`):
  - **Your club:**
    - budgets: transfer budget, wage room, and squad cost against the FFP limit;
    - FFP warning or ban;
    - the fees/wages control (SPEC §6.3, new call `setWageShare`).
  - **Squad and contracts:** value, mood, fee left, and an "expires" badge for final-year players.
  - **Contract talks:** mood breakdown and the ask per length; renew, bid (accepted, counter or reject), sign, or propose a loan out or in.
  - **Bids:** yours, and AI bids for your players with Accept and Reject.
  - **Market search:** at other clubs or free agents, by position, OVR and age (new call `searchPlayers`).
  - **Every club:** cash, budget base, revenue, expenses, wages, amortisation, squad cost and last season's FFP ratio, FFP standing, strategy, board target and confidence, budgets, seniors, loans in and out.
  - **The season's transfer log, and the inbox.**
- Fixed while checking: after an action the talks panel refreshed and cleared its own success message.
- The Season lab labels transfers, loans and renewals in its transaction counts.
- **Browser checks** (headless Chrome against the production build):
  - Club lab: 19/19 pass (budget control, renewal, free-agent signing, a lowball bid rejected, a loan answered, the AI's summer deals in the log, bids lapsing at the deadline, no console errors);
  - Season lab 21/21; M1 18/18 (reference data regenerated);
  - Match lab smoke run: simulate, watch, pause, to the end, 1,000 matches at 0.98 ms each with goals in band.
- A save test covers the Club lab view, the search and the budget control. 222 tests in all.

### M4 summary
- **Built:**
  - revenue, expenses and cash flow; hype, reputation, facilities, AI dials and the board;
  - market value, mood (with subtle ambition), contracts, renewals and expiry;
  - transfers (two-step), AI strategy and valuation, AI-to-AI deals and bids for your players;
  - free agents with falling asks, and loans;
  - FFP with amortisation;
  - the M4 harness gates and the Club lab.
- **Tuning** (T's decisions in the Deviations table):
  - parity by match randomness (form on the day) and a little more rotation;
  - wages +15%;
  - development: more ceiling room to 27, a smaller top-end talent bonus, a soft cap on ceilings, POT minutes refitted;
  - MVP champion band 76–100;
  - POT exceed target 20%.
- **All gates pass** with 3 worlds × 20 seasons. Highlights:

| Check | Result | Target |
|---|---|---|
| ENG1 champion / bottom points | 78.5 / 28.8 | 76–100 / 18–36 |
| Top six losing to the bottom six | 16.8% | 13–22% |
| Young regulars' growth / benched | +4.19 / +1.69 a year | 4–8 / 0–2 |
| Wonderkids per league per season | 0.58 | 0.5–1.8 |
| Beating displayed POT | 15.8% | 14–30% |
| Senior mean OVR / 75+ share drift | −0.9 / +0.0 pts | ±1.5 / ±1.5 pts |
| Peak age (27–29 v 24–26) | 64.8 v 64.6 | 27–29 highest |
| Squad cost / wages, every season | 52–60% / 43–56% | 50–68% / 35–65% |
| Negative cash (worst season) | 6% | < 15% |
| Promoted clubs staying up | 44% | 35–60% |
| Exploits (star for two fees, weak loans) | 0 of 27, 0 of 90 | never |

- **Known edges, for later:**
  - draws 22.5% (target 25%, floor 22%; any per-match randomness lowers them);
  - champion, peak age and wonderkids are near their edges;
  - cash still builds up (about 2× revenue after 20 seasons);
  - the champion band is to be revisited with European competition.

## Open issues
- Firefox not tested yet (Chrome: automated + T; Safari: T), for M0 and M1.
