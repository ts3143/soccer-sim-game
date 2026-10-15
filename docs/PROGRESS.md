# Build Progress

Claude Code updates this file at the end of each milestone.

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 Scaffold and plumbing | **Accepted** (T, 2026-10-14) | All acceptance checks pass locally and on the Cloudflare preview; T tested in Chrome and Safari. See "M0 notes" below. |
| M1 Data, generation and new league | **Accepted** (T, 2026-10-14) | All checks pass locally, in CI and on the Cloudflare preview (18/18 headless Chrome); T tested in Chrome and Safari. See "M1 notes" below. |
| M2 Match engine + calibration harness | **Accepted** (T, 2026-10-14) | All gates pass locally, in CI (`calibrate --check`) and on the Cloudflare preview (Match lab 11/11, M1 18/18 headless Chrome); T tested in the browser. Parity is gated in M3 (T). See "M2 notes" below. |
| M3 Season loop | In progress | Chunks 1–8 built and tuned: 16 of 17 season-loop checks pass (well-played 18–21 growth +3.8, target 4–8). Season lab page (chunk 9) next. See "M3 notes" below. |
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
| 2026-10-14 | M2 chunk 4 | The parity target (top-6 losing to bottom-6, 13–22%) moves from the M2 gate to M3, with the other season targets. M2 reports it (ENG1 11.6%). | M2's harness plays full-strength XIs every match with no rotation, fatigue or injury lists; those cause many real upsets and arrive in M3. Tuning parity harder in M2 pushed the ENG1 champion below 82 points. | MILESTONES M2, M3; `tools/calibrate` |
| 2026-10-14 | M3 plan | League tie-breakers defined: points, goal difference, goals scored, head-to-head points, head-to-head goal difference, seeded draw; each league sets its own order in config. Awards are worked out and saved at season end in M3 (pages in M5). Until M4, contracts roll over and AI clubs top up to 22 seniors each preseason from their academy, then from free agents. Promoted-club survival and the finance checks of the 20-season run are gated in M4. M3 adds a developer-only Season lab page. | The spec named tie-breakers without defining them, and no milestone owned awards. Without contracts and transfers (M4), a 20-season run would empty squads. Promoted clubs can't strengthen without transfers. | SPEC §2.1; `competitions_mvp.json` → `tieBreakers`; MILESTONES M3 |
| 2026-10-15 | M3 chunk 4 | Injuries also happen in training between matches, with the same risk formula once per day (that day's condition, Medical dial, Injury Prone). | With in-match injuries only, squads averaged ~1.9 injured at once against a target of 2–4.5. Raising the in-match rate would have meant unrealistic numbers of injury substitutions; in real football about half of injuries happen in training. | SPEC §8.4; MILESTONES M3 |
| 2026-10-15 | M3 chunk 5–6 | The opening world starts in the shape the season loop settles at: 9–12 academy players per club, aged 15–17 (was 4–6, aged 15–18), and ~190 just-released 18-year-olds added to the free-agent pool. Club players ~2,100 (M1 check now 1,922–2,232). | With the spec's youth intake (3–6 a year, 2–3 years in the academy), active players rose ~35% over the first seasons before levelling off, failing the ±10% stability target. T chose to match the opening world to the steady state (option B). | SPEC §2.1; MILESTONES M1; `generate/squad.ts`, `generate/freeAgents.ts`, `generate/checks.ts` |
| 2026-10-15 | M3 chunk 7 | Development training base lowered from 0.4 to 0.2: dev = coaching × (0.2 + 0.8 × minutesFactor × challengeFactor) + performanceAdj (academy players: coaching × (0.2 + 0.8 × youth factor)). | With 0.4, a young regular (≥50% of minutes) grew only ~1.7× as fast as a benched one, so +4 to +8 a year for regulars and 0 to +2 for benched players couldn't both hold. | SPEC §5.3; `DEV.trainingBase` |

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

## M3 notes (2026-10-14, in progress)
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
- **fail: well-played 18–21s +3.81 a year (target 4–8).**

For information:
- promoted clubs' survival 66% (M4 target 35–60%);
- senior mean OVR 57.0 → 54.7 over 20 seasons;
- 75+ share 2.6% → 6.4%;
- by age, the last season's 21–23s (57.2) are better than its 27–29s (56.1): players peak earlier than in real football.

**Why the last check is hard:** players who play aged 18–21 are, by selection, the ones closest to their ceilings. Settings that push them past +4 a year also raise the wonderkid count above 1.8 and inflate the top end. A grid over talent headroom, average headroom and youth quality, and a run with growth spread into the mid-20s, all traded one failing check for another. Question for T.

## Open issues
- Firefox not tested yet (Chrome: automated + T; Safari: T), for M0 and M1.
