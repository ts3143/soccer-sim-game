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
- Load `clubs_2026_27.json`, competition/formation/rating configs.
- Name files per nationality in `data/names/` from public-domain or permissively licensed sources; document sources in `data/names/SOURCES.md`.
- Player generator: bio, 22 ratings by archetype, height/weight, preferred foot, all 10 position OVRs, hidden ceiling, curve type, hidden traits, mood traits.
- Squad generator: ~25 senior + 4–6 academy per club, position balance for the default formation, tuned so each club's best-XI OVR hits its `strength` (±1). Contracts and wages so each club starts at ~50–65% squad cost ratio.
- Seeded free-agent pool.
- POT via cheap simulated arcs.
- New league creation writes a full save.

**Accept**
- New league: 62 clubs, ~1,800 senior players, plausible OVR distribution (few 75+, many 50–65).
- Every club's best-XI OVR within ±1 of `strength`; hierarchy matches club data.
- Generation is deterministic for a given seed. Unit tests on OVR and generator.

---

## M2 — Match engine (headless) + calibration harness
**Build**
- Team ratings from XI + sliders + formation.
- Possession chain, xG, events, cards, fouls, penalties, corners, set pieces, injuries in match, energy drain and effective ratings.
- Substitutions (5) and AI in-game rules; extra time and penalties.
- Match ratings; box score, scoring summary, key events, team stats.
- **Resumable API:** `start → step(n possessions) → applyChanges(subs/sliders/formation) → … → finish`.
- `pnpm calibrate`: sims many matches/seasons headlessly in Node and prints a pass/fail report against `calibration_targets.json`.

**Accept**
- Per-match calibration targets pass over ≥ 10,000 simulated matches.
- Stronger teams win more, in line with the parity target; sliders change outcomes in the intended direction (unit tests).
- A paused-and-resumed match with no changes produces the identical result to an uninterrupted one with the same seed.
- One headless match < 5 ms.

---

## M3 — Season loop (headless)
**Build**
- Calendar and fixture generation (weekend/midweek slots, ENG2 midweek rounds, GER1 winter break), standings, tie-breakers.
- Cups (draws, byes, ET/pens), Championship play-offs (6 clubs: eliminators, two-legged semis, final), promotion/relegation.
- Condition, recovery by days elapsed, injuries tied to condition and Medical dial.
- Rotation/lineup AI with mid-term view.
- Development updates (summer, winter), aging, ceiling decay, retirement, youth intake, academy promotion/release, pruning.
- Phase machine and dated events; Play-menu actions as worker functions.

**Accept**
- A 20-season headless run completes without errors; season and development calibration targets pass; player count stays within ±10%.
- Top-club starters' minutes share within target; at least 3 distinct ENG1 champions in 20 seasons.

---

## M4 — Economy and market (headless)
**Build**
- Revenue streams, budget dials, cash flow, board expectations and confidence, firing.
- FFP squad cost ratio, warning → one-window transfer ban.
- Mood, contracts, negotiation; renewals in windows.
- Transfers (two-step), AI strategy and valuation, AI-to-AI deals, bids for user players, market value; loans; free-agent pool dynamics.

**Accept**
- 20-season run: world-stability checks in `calibration_targets.json` pass (negative-cash share, squad cost ratios, promoted-club survival, etc.).
- Wage/fee levels stay plausible relative to revenue; no runaway inflation or deflation.
- Exploit checks: can't buy a star by offering several average players' worth; weak-loan development exploit doesn't work.

---

## M5 — Core UI
**Build**
- App shell mirroring ZenGM: top bar with Play menu, sidebar sections, team dropdown on team pages.
- New league screen; Dashboard; Standings; Cups; Weekly Schedule; Squad; Player profile (incl. radar chart and OVR/POT history); Box score / Game log; League Leaders; Player Ratings; Player Stats; Team Stats; Injuries; History (league and team); Transactions; Power Rankings; Finances overview of all clubs.

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
