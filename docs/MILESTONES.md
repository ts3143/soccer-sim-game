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
- Squad generator: 22–24 senior + 4–6 academy per club. Each club gets a seeded default formation from the 5 MVP presets; its squad is built around it and saved as its starting tactics; tuned so the best-XI OVR in that formation hits `strength` (±1). Contracts and wages so each club starts at ~50–65% squad cost ratio.
- Seeded free-agent pool.
- Development core (pure functions): age curves per rating group and curve type, the dev multiplier, growth/decline per SPEC §5.3. Pulled forward from M3 because POT depends on it; M3 wires it into the season and calibrates it.
- POT via cheap simulated arcs (provisional until M3 calibration).
- New league creation writes a full save.
- Generation inspector page (developer-only, replaced in M5) and `pnpm generate --check`, a headless report of the acceptance checks that CI also runs.

**Accept**
- New league: 62 clubs, ~1,800 club players including academies (22–24 senior + 4–6 academy per club, i.e. 1,612–1,860), free agents on top; plausible OVR distribution (few 75+, many 50–65).
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
- Stronger teams win more, in line with the parity target; sliders change outcomes in the intended direction (unit tests).
- A paused-and-resumed match with no changes produces the identical result to an uninterrupted one with the same seed.
- One headless match < 5 ms.

---

## M3 — Season loop (headless)
**Build**
- Calendar and fixture generation (weekend/midweek slots, ENG2 midweek rounds, GER1 winter break), standings, tie-breakers.
- Cups (draws, byes, ET/pens; in season 1 the German cup preliminary round uses the 4 lowest-`strength` clubs), Championship play-offs (6 clubs: midweek eliminators after the final round, two-legged semis over a weekend + midweek, final around 23–25 May), promotion/relegation.
- Condition, recovery by days elapsed, injuries tied to condition and Medical dial.
- Rotation/lineup AI with mid-term view; if fewer than 16 seniors are fit, academy players aged 16+ fill the bench.
- Development updates (summer, winter), using the development core built in M1: dev multiplier on growth only, blending to neutral between 23 and 27; decline = age × Medical dial; small mental minutes bonus at any age. Aging, ceiling decay, retirement, youth intake, academy promotion/release, pruning (a pruned player's stat rows go with him).
- Phase machine and dated events; Play-menu actions as worker functions.

**Accept**
- A 20-season headless run completes without errors; season and development calibration targets pass; player count stays within ±10%.
- Top-club starters' minutes share within target; at least 3 distinct ENG1 champions in 20 seasons.
- Development unit tests: a benched 33-year-old doesn't decline slower than a starter; the dev multiplier never changes decline; the multiplier is neutral from 27.

---

## M4 — Economy and market (headless)
**Build**
- Revenue streams, budget dials, cash flow (current cash on the club, season-end snapshot in `clubSeasons`), board expectations (per-league targets in config; GER1's lowest is "finish above the bottom 3") and confidence, firing.
- FFP squad cost ratio, warning → one-window transfer ban.
- Mood, contracts, negotiation; renewals only in windows, no end-of-season re-sign phase (contracts ending 30 June must be renewed by 31 January; AI follows the same rule). Inbox: a warning when the January window opens listing every player in his final six months, and a reminder before deadline day.
- Transfers (two-step), AI strategy and valuation, AI-to-AI deals, bids for user players, market value; loans; free-agent pool dynamics.

**Accept**
- 20-season run: world-stability checks in `calibration_targets.json` pass (negative-cash share, squad cost ratios, promoted-club survival, etc.).
- Wage/fee levels stay plausible relative to revenue; no runaway inflation or deflation.
- Exploit checks: can't buy a star by offering several average players' worth; weak-loan development exploit doesn't work.
- Contracts not renewed by 31 January (user or AI) expire on 30 June and the players become free agents on 1 July; the January inbox warning and deadline-day reminder fire.

---

## M5 — Core UI
**Build**
- App shell mirroring ZenGM: top bar with Play menu, sidebar sections, team dropdown on team pages.
- New league screen; Dashboard; Standings; Cups; Weekly Schedule; Squad (with contract-expiry badges); Player profile (incl. radar chart and OVR/POT history); Box score / Game log; League Leaders; Player Ratings; Player Stats; Team Stats; Injuries; History (league and team); Transactions; Power Rankings; Finances overview of all clubs.

**Accept**
- A full season can be played start to finish using only the Play menu, and every listed page renders correct data.
- Real club names (`based_on`) appear nowhere in the UI.

---

## M6 — Management UI
**Build**
- Tactics page (formation dropdown, drag-and-drop slots and bench, sliders, live team ratings, Auto).
- Watch live: pre-match temporary changes, live feed, stats, energy bars, subs, sliders, pause/adjust, half-time screen.
- Transfer Market (Search, Your listed players, Incoming offers, Loans), Free Agents, Contract negotiation modal.
- Youth Academy; Finances/Facilities (own club); Inbox; Settings; Manage Leagues; "You're fired" flow.

**Accept**
- T can run his club through 3+ seasons entirely in the UI: sign, sell, loan, renew, set tactics, watch and change a match live, promote academy players.

---

## M7 — Polish and release v0.1
**Build**
- Performance pass against the budget; retention and pruning verified; save-size check after 10 seasons.
- Bug bash; empty/edge states; basic responsive layout so nothing breaks on a laptop screen.

**Accept**
- Performance budget met; no known crashers; deployed to Cloudflare Pages as v0.1.
