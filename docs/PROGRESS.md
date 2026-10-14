# Build Progress

Claude Code updates this file at the end of each milestone.

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 Scaffold and plumbing | **Accepted** (T, 2026-10-14) | All acceptance checks pass locally and on the Cloudflare preview; T tested in Chrome and Safari. See "M0 notes" below. |
| M1 Data, generation and new league | **Accepted** (T, 2026-10-14) | All checks pass locally, in CI and on the Cloudflare preview (18/18 headless Chrome); T tested in Chrome and Safari. See "M1 notes" below. |
| M2 Match engine + calibration harness | In progress | Engine built and tuned (chunks 1–4); parity decision pending with T; Match lab page next. See "M2 notes" below. |
| M3 Season loop | Not started | |
| M4 Economy and market | Not started | |
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

## M2 notes (2026-10-14, in progress)
**Calibration status** (`pnpm calibrate --seasons 4`, 3 worlds, 12 seasons per league):
- All 19 per-match targets pass on the neutral sample (~10,000 matches).
- ENG1, ENG2 and GER1 pass every style-scaled check (goals, xG/shot, conversion × chance quality; fouls, yellows, reds × foul rate).
- Speed: 0.84 ms per match.
- Gated failure: ENG1 top-6 losing to bottom-6 is 11.6% (band 13–22%). ENG2 is at 17.6% and GER1 at 14.1%.
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

## Open issues
- Firefox not tested yet (Chrome: automated + T; Safari: T), for M0 and M1.
