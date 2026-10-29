# Build Progress

Claude Code updates this file at the end of each milestone.

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 Scaffold and plumbing | **Accepted** (T, 2026-10-14) | All acceptance checks pass locally and on the Cloudflare preview; T tested in Chrome and Safari. See "M0 notes" below. |
| M1 Data, generation and new league | **Accepted** (T, 2026-10-14) | All checks pass locally, in CI and on the Cloudflare preview (18/18 headless Chrome); T tested in Chrome and Safari. See "M1 notes" below. |
| M2 Match engine + calibration harness | **Accepted** (T, 2026-10-14) | All gates pass locally, in CI (`calibrate --check`) and on the Cloudflare preview (Match lab 11/11, M1 18/18 headless Chrome); T tested in the browser. Parity is gated in M3 (T). See "M2 notes" below. |
| M3 Season loop | **Accepted** (T, 2026-10-16) | All M3 gates pass locally, in CI (`calibrate --world --check`, 16 checks) and on the Cloudflare preview (Season lab 19/19, Match lab 11/11, M1 18/18 headless Chrome); T tested in the browser. Young regulars' growth and world shape gated in M4 (T). See "M3 notes" below. |
| M4 Economy and market | **Accepted** (T, 2026-10-19) | All gates pass locally, in CI (`calibrate --check`, `calibrate --world --check` with the M4 economy, world-shape and exploit gates; 222 tests) and on the Cloudflare preview (Club lab 19/19, Season lab 21/21, M1 18/18 headless Chrome); T tested locally. Champion band 76–100 for the MVP (revisit with Europe). See "M4 notes" below. |
| M5 Core UI | **Accepted** (T, 2026-10-19) | All checks pass locally, in CI and on the Cloudflare preview and production (game pages 90/90, full-season sweep 43/43, Club lab 19/19, Season lab 21/21, M1 18/18 headless Chrome); T tested locally. See "M5 notes" below. |
| M6 Management UI | **Accepted** (T, 2026-10-20) | All checks pass locally, in CI and on the Cloudflare preview and production (career 11/11, management screens 74/74, game pages 90/90, full-season sweep 43/43, Club lab 19/19, Season lab 21/21, M1 18/18 headless Chrome); T tested locally. See "M6 notes" below. |
| M7 Polish and release v0.1 | **Released as v0.1.0** (2026-10-21) | All checks pass locally, in CI and on the Cloudflare preview and production (354 headless Chrome checks locally; 291 against production; both calibration harnesses with the 1-OVR peak-age allowance). PR #8, merge `02ac0de`, tag and GitHub release v0.1.0. Firefox untested (T, by hand). See "M7 notes" below. |
| After v0.1: T's improvements | **Released as v0.2.0** (2026-10-21) | Match ratings (chunk 1, keepers at 6.8), fit highlights in line-ups (chunk 2), the full tactics board in live matches (chunks 3–4). T tested locally; PR #9 with CI and the Cloudflare preview green; tag v0.2.0 (no GitHub release notes, T). See "After v0.1 notes" below. |
| SL0 Worlds as data (Super League plan) | **Built, waiting for T's local test** (2026-10-27) | Classic identical to main (fingerprints; 3 worlds × 20 seasons of `calibrate --world` print main's numbers); every gate and all 18 browser checks pass locally. Local branch `super-league`, not pushed. See "SL0" under "Super League notes" below. |
| SL1 Super League data and generation | **Built, waiting for T's local test** (2026-10-27) | 48 clubs (values approved by T), crests, Classic's 14 shared clubs renamed (byte for byte the same otherwise), Ukrainian names, country mixes, the Super League's competitions config and world; it generates and passes its checks, and a save of it can be created in the worker (New game still offers Classic only, SL7). Local branch `super-league`, not pushed. See "SL1" under "Super League notes" below. |
| SL2 Season, play-offs and the first harness | **Built, waiting for T's local test** (2026-10-27) | One play-off format for every play-off (Classic's rewritten in it, identical results); Star's champion its play-off winner; the off-season stages; the draft's AI core and a summer free-agent top-up (brought forward, T); `pnpm calibrate --world superLeague` passes its 20-season acceptance. Local branch `super-league`, not pushed. See "SL2" under "Super League notes" below. |
| SL3 Soft cap and finances | **Built, waiting for T's local test** (2026-10-27) | The cap's rules (payroll, the cap by tier, grace, minimum wage, trade matching, the luxury tax and its sharing) in the season; FFP off by switch; TV money by tier and play-off prizes as T approved (base cap €180m); AI re-signings priced against the cap (T); the harness reports cap violations and tax. Payrolls still drift over the cap through core re-signings: for SL5. Local branch `super-league`, not pushed. See "SL3" under "Super League notes" below. |
| SL4 Draft | **Built, waiting for T's local test** (2026-10-28) | The lottery (T's odds), three classes visible, picks as owned assets two drafts ahead, the user's picks in the draft, the re-signing period, free agency from 1 July to the roster deadline, the 25-player limit from the first league match; 20-season world health gated. Local branch `super-league`, not pushed. See "SL4" below. |
| SL5 Trades | **Built, waiting for T's local test** (2026-10-28) | Trade valuation, the user's trades and "What would make this work?", AI-to-AI trades, salary shedding by relegated clubs, AI offers to the user and the trading block; trade exploits gated. Local branch `super-league`, not pushed. See "SL5" below. |
| SL6 Validation and tuning | **Built, waiting for T's local test** (2026-10-28) | 3 up and 3 down (T); the rise reported, not gated (T: 8.4 seasons on 6 worlds); all Super League gates pass on CI's 3 worlds. Local branch `super-league`, not pushed. See "SL6" below. |
| SL7 UI | **Built, waiting for T's local test** (2026-10-28) | New game's world choice and names file; Standings and Play-offs; Draft and Draft Picks; Trade, Trading Block and inbox offers; Re-sign Players, free agents and both Finances pages under the cap; How to play's Super League section. Browser check `superleague` runs a Blue club through three seasons; every Classic browser check passes. Local branch `super-league`, not pushed. See "SL7" below. |
| SL8 Release | **In progress** (2026-10-29) | Every gate passes on both worlds; Classic plays exactly as `main`; a save from `main`'s build (production's bundle) opens on this build as Classic and plays on. Local branch `super-league`, not pushed. See "SL8" below. |

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
| 2026-10-19 | M5 plan | The Inbox page moves from M6 to M5; the developer pages stay at a hidden `/dev` address through M6. Charts and routing are built in-house. | The Dashboard previews the inbox; until M6's transfer screens, the Club lab is the only place to trade. Approved by T. | MILESTONES M5, M6 |
| 2026-10-19 | M6 plan | Releasing a player (user): he leaves at once, his wages are still paid monthly until the contract ends and count for FFP. Academy players 18+ the user hasn't decided on by 1 July get the AI rule, with an inbox reminder in May. Ticket price set in preseason, locked after the first home match, "Auto" = the AI price. Settings: rename and delete the save; the live-match speed is a slider on the Watch live screen. Transfer list: AI clubs that need the position bid around the asking price. A live match is saved as it goes and resumes after the game is closed. | The spec didn't cover releasing, academy players left undecided, when the price can change, what Settings holds or how listing works. Approved by T. | SPEC §6.2, §7.2, §7.6, §11 |
| 2026-10-19 | M6 chunk 5 | The user can sign free agents at any time; AI clubs sign them only on their market days, inside the windows (as built in M4). | SPEC §3.1 said "at any time" for everyone. Changing the AI would need a calibration run. Kept by T. | SPEC §3.1 |
| 2026-10-20 | M7 plan | "Mid-range laptop" for the 60 s season budget = a machine 4× slower than the developer's: the measured season time × 4 (Chrome's CPU throttling doesn't reach the worker; T confirmed after chunk 2). T tests Firefox by hand. v0.1 is shown in the app, with a CHANGELOG and a GitHub release v0.1.0. | The spec named no reference machine; Firefox needs a separate browser download to automate. Approved by T. | SPEC §14 |
| 2026-10-20 | M7 chunk 4 | One league open at a time: the league opened most recently on purpose is the open one; tabs showing another league stop, and their calls are refused instead of switching back. An action under way finishes and is saved first (decision #58). | The spec didn't say what happens with two leagues in two tabs. Before, two tabs could switch the open league back and forth forever, and opening another league could close a save mid-season. Closest to ZenGM. Approved by T. | SPEC §13 |
| 2026-10-20 | M7 chunk 6 | "How to play" is a page in the game, linked from Manage Leagues and the sidebar's Tools; the README points to it (decision #59). | Players play on the website and never see the README. Approved by T. | SPEC §11 |
| 2026-10-21 | M7 chunk 6 | Sendings-off bring suspensions: one match for a second yellow, three for a straight red, served in the club's next domestic fixtures (also while injured) and carried across seasons and transfers. No bans for yellow-card build-ups yet. Red cards cut from about 0.18 to 0.14 a match (engine tuning) (design doc #60). | The spec had no suspensions; T asked whether red-carded players were suspended (they weren't) and found red cards too frequent. | SPEC §8.9, §12 |
| 2026-10-21 | M7 chunk 6 | Tactics and the pre-match line-up show the XI on a pitch beside the table; the player profile maps OVR at every position on a pitch (design doc #61). | Replaces "No pitch view": T asked for a formation view. | SPEC §11 |
| 2026-10-21 | M7 chunk 6 | Twelve cosmetic skill tags beside player names, worked out from the displayed ratings; no gameplay effect (design doc #62). | Was "Ideas, undecided"; T approved the list and the cutoffs. | SPEC §11, §15 |
| 2026-10-21 | M7 chunk 6 | The profile's OVR/POT chart becomes a ratings-history table (every update, all 22 ratings). Also: compact status tags (I, E, TL, S, L, A), nationality flags, ratings cards on Squad and Tactics, whole result rows coloured, more Transfer Market filters, and player links in messages, with a new optional saved field `inbox.players` (design doc #63). | T's local-test feedback, ZenGM style. | SPEC §11, §12 |
| 2026-10-21 | M7 chunk 6 | World peak-age gate: 27–29-year-olds must be rated at least as high as 21–23 and 24–26 in the last season, less 1 OVR (design doc #64). | With the world unchanged, the gap swings about ±1 OVR across seeds (−0.9 to +0.3 over six runs, before and after the red-card change), so the exact gate passed or failed by chance. Approved by T. | `calibration_targets.json` → `peakAge`; `tools/calibrate/world-report.ts` |
| 2026-10-21 | After v0.1, chunk 1 | Match ratings centred on 6.9 (was 6.6) with a wider spread and a soft top above 8.4; tackles, interceptions and key passes weigh more; keepers rated mainly on goals prevented (post-shot xG faced − goals conceded), with a soft bottom below 5. Development and market value read ratings against the new centre, rescaled to the same effect. Saves upgrade to league DB v3, which converts stored ratings once (design doc #65). | T found standout games rated too low, terrible ones too high and the 6.6 average low, and asked for keepers judged on saves against xG. | SPEC §8.7, §5.3; `calibration_targets.json` → `avgMatchRating` 6.9 (6.8–7.0) |
| 2026-10-21 | After v0.1, chunk 1 follow-up | Keepers' ratings centre on 6.8 (outfielders 6.9); development, market value and the old-save conversion use each position's centre (design doc #65). | At 6.9 a keeper's clean sheet (7.6) and a blameless four conceded (6.3) both sat above T's targets; one lower centre fixes both. Approved by T. | SPEC §8.7, §5.3 |
| 2026-10-21 | After v0.1, chunk 2 | Dragging or picking a player in a line-up highlights where he fits: natural (within 3 OVR of his best) darker, cover (4–8 below) lighter, the rest plain; keepers and outfielders never mix. The line-up view gains each player's OVR in every slot and his best OVR, and each slot's position (design doc #66). | T asked for it: taking a CM out, he wants to see the CMs who could come in. | SPEC §11 |
| 2026-10-21 | After v0.1, chunk 3 | At a pause in a live match, players can be moved between slots for free, including into a sent-off player's empty slot (a sent-off player still can't be replaced). Live changes are all or nothing. New worker calls give the pause screen a tactics board (slots, the substitutes left, team ratings now, each player's energy, goals, assists and rating so far) and a preview of changes (design doc #67). | T lost a centre-back to a red card and couldn't fill the slot; he asked for the full board, free position moves and a rating-so-far column. | SPEC §7.1 |
| 2026-10-21 | After v0.1, chunk 4 | The pause screen of a live match is the tactics board (pitch, XI and bench tables, formation, sliders, team ratings with a preview; energy and the match so far, rating so far included), replacing the dropdowns. Make changes / Reset / Resume (design doc #67). | T's request: the dropdowns didn't show enough to decide. | SPEC §11 |
| 2026-10-23 | Ratings layout | The ratings card and the profile show the 22 ratings FM style: Technical \| Mental + Set pieces \| Physical + Goalkeeping, full names, fixed order. Heavy-weight ratings for the position shown are highlighted as key, medium-weight as useful; only the number is colour-scaled. In the XI the slot's position decides ("this slot"). Display groups relabelled in `ratings_positions.json` (`ant` now shows under Mental, as it develops) (design doc #68). | T: the chips in storage order were hard to read and didn't show what matters for a position. | SPEC §4.2, §11; `ratings_positions.json` → `ratings[].group` |
| 2026-10-25 | Inbox on the Dashboard | The Inbox page goes; the whole inbox sits in the Dashboard's right-hand column (filter, Mark all read, scrolling list), and old `/inbox` links open the Dashboard. A bid message for one of the user's players has Accept and Reject while the bid is open, then its status. Bid messages save the bidding club (`inbox.bidFrom`, optional) (design doc #70). | T asked for both: one place for messages, and answering a bid without going to the Transfer Market. | SPEC §7.3, §11, §12 |
| 2026-10-25 | Yellow-card bans | Every fifth yellow of a season earns a one-match ban, counted across all domestic competitions; a second-yellow dismissal's yellow doesn't count. New optional saved field `players.yellows` (design doc #71). | T: "1 game suspension after 5 yellows" (OPEN_QUESTIONS A10 #8). | SPEC §8.9, §12 |
| 2026-10-25 | Pre-match unavailable players | Before a watched match, injured and suspended players are listed, greyed out, under Not in the squad; they can't be picked (design doc #72). Players in the saved line-up now stay in it: see "Watched matches start from the saved tactics". | T wants to see who's missing, not have them vanish. | SPEC §11 |
| 2026-10-25 | Live commentary | Shots in the live feed say how the chance came about, who made it and who stopped it; cards and penalties name the foul; goal lines carry the score; several phrasings per event. A Key moments / Full commentary switch. Shot events carry an optional `story` (feed only, never saved in match records) (design doc #73). | T asked for more narrative in the live game. | SPEC §11 |
| 2026-10-25 | Match preview and form | Before a watched match, a preview card: both clubs' last five results, their last meeting, a same-city derby badge. The player profile gets a Form card: his last five matches with ratings. New worker call `getMatchPreview`; `PlayerView.form` (design doc #74). | T asked for more narrative in the live game and on the player profile. | SPEC §11 |
| 2026-10-25 | Honours and Top assists | A new season award, Top assists (most league assists per league), listed on History. The player profile gets an Honours card and badges on his Career rows: his awards and his clubs' titles, cups and promotions in seasons he played in that competition for that club. `PlayerView.honours` (design doc #75). | T asked for honours on the profile, ZenGM-style badges in the stats table, and an assists award. | SPEC §10.5, §11 |
| 2026-10-25 | Birthplaces shown; local lads | The profile's bio shows the birthplace every player has had since M1 (Wikidata footballers' birthplaces, `data/names`). About half of a club's academy players from its own country are now born in the club's city; older saves get the same through league DB v5 (design doc #76). | T asked for birthplaces, then chose the existing footballer data over GeoNames towns by population. | SPEC §4.1 |
| 2026-10-25 | Injury history | Every injury is recorded on the player (`players.injuries`: date, type, days, the fixture and opponent or training), from the league's start (`GameMeta.injuriesSince`; an older save from its upgrade, league DB v6). The profile shows an Injury history card (design doc #77). | T asked for an injury history on the profile. | SPEC §11, §12 |
| 2026-10-25 | The user's tactics are his | The Tactics page always holds the user's saved tactics, changed only by him: the AI's pick is saved when he takes a club (new league, new job; league DB v7 for older saves), and injured or suspended players stay in it with a warning. Simulated matches start from it: his XI are the AI's regulars (each counts as the best for his saved slot), today's rotation rests them, injured and suspended players are replaced, his bench comes first; sliders stay the AI's. Nothing is written back (design doc #78). | T came back to Tactics and found the AI's pick had changed (unsaved line-ups showed a fresh AI pick each time) and wants his tactic to be the main one. T chose today's rotation, so simulating isn't a disadvantage, and the AI's sliders. | SPEC §8.3, §9, §11 Tactics, §12 |
| 2026-10-25 | Watched matches start from the saved tactics | Before a watched match the pre-match line-up is the saved tactics exactly as saved: injured and suspended players stay in their slots (flagged), and the match can't kick off while the XI or bench names a player who can't play today or a slot is empty; the page lists who and why. Auto (the AI's simulated-match pick) or a swap clears it. No silent replacements or bench top-up any more (design doc #78). | T wants watched matches to show his tactics until he changes them, and never to start with an injured or suspended player. T didn't want a separate "Replace unavailable players" button: Auto does it. | SPEC §11 Watch live |
| 2026-10-23 | Man of the match | Every match names a man of the match: the highest rating, from either side; ties go to the winning side, then goals + assists, minutes, the lower pid. Saved on the match record (`MatchResult.motm`) and counted on the season stat rows (`PlayerStatsRow.motm`); shown in the box score, at full time live, on Player Stats, League Leaders and the profile's career. League DB v4 fills it in for older saves (design doc #69). | T asked for it, and wants it recorded so later awards can use it. | SPEC §8.7, §10.3, §10.4 |
| 2026-10-27 | Super League world | A second world picked at New game (Classic or Super League), built from switches rather than a mode check; Classic unchanged. 48 clubs in three tiers of 16, play-offs for promotion and the Star title, a two-round lottery draft, trades with future picks, one roster deadline, one re-signing period, a tiered soft cap with a grace season; no academy, loans, transfer market, FFP or cups in that world (design doc #79–#82). | T's Super League concept (OPEN_QUESTIONS A12). | SPEC §17 (new), §11 New league; MILESTONES SL0–SL8 |
| 2026-10-27 | Club names | T's names for the 14 clubs in both worlds, in Classic too (name, short name, abbreviation, crest initials; city unchanged). Real names still never ship; a user may load his own names file at New game (design doc #83). | T prefers his names; the real-names rule stands. | SPEC §1, §17.3 |

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

## M5 notes (2026-10-19)
**Plan** (approved by T): 8 chunks of about an hour.
1. App shell, routing, Play menu, Manage Leagues and the new league screen.
2. Shared table component, Dashboard and Inbox.
3. Standings, Cups and Weekly Schedule.
4. Squad and Player profile, part 1.
5. Player profile, part 2 (radar, OVR/POT history, career stats), Box score and Game log.
6. Stats pages: League Leaders, Player Ratings, Player Stats, Team Stats, Injuries.
7. History (league and team), Transactions, Power Rankings, the all-clubs finances overview.
8. Browser checks for every page, the real-names sweep, docs and handover.

**Chunk 1: app shell, routing, Play menu, Manage Leagues, New league** (`src/ui/router.tsx`, `src/ui/shell/`, `src/ui/pages/`)
- **Router** (in-house, as ZenGM): the URL is the source of truth.
  - Paths: `/` (Manage Leagues), `/new`, `/dev` (developer pages), `/l/:lid` (Dashboard) and `/l/:lid/:page/...`.
  - Links are real `<a>` elements, so new tabs work. Back, forward and reloads work.
- **Shell:**
  - **Top bar:** the Play menu (the phase's options; shows "Playing…" while it runs), the date, season, phase and window, the save's name, and your club (crest, link to its squad). It's edged in your club's primary colour.
  - **Sidebar:** sections General, League, Team, Players and Stats, plus Tools. The M6 pages are shown greyed. On narrow screens it opens from a Menu button.
  - **Banner when sacked:** your job offers to accept. The full "You're fired" screen comes in M6.
- **Page header** with the team dropdown (any club, grouped by league) and the season dropdown; changing either navigates.
- Pages not built yet show which chunk brings them.
- **Manage Leagues:** your saves, newest played first, with Play and a two-step Delete.
- **New league:** league tabs, then club cards (crest, colour, city, squad strength, revenue), a name and an optional seed.
- **Worker:** new call `getLeagueShell`: names, clubs, leagues and game state. Club choices now also carry city, reputation, revenue and colour.
- The developer inspector moved to `/dev` unchanged.
- **Tests:** 3 router tests and a shell view test (226 in all).
- **Browser checks:**
  - new `check-m5` passes: the empty home page, the new league screen, starting a league, the top bar, sidebar links, the season and team dropdowns, back, a deep link after a reload, Play → Until next match, the save in Manage Leagues, `/dev`, no real names, no console errors;
  - the M1, M3 and M4 checks now run at `/dev`, and all pass.
- **Judgment calls:**
  - no Stop button on the Play menu (a whole season takes ~2 s in the browser);
  - one team dropdown for all 62 clubs, grouped by league, as ZenGM.

**Chunk 2: shared table, Dashboard, Inbox**
- **Shared table** (`src/ui/components/DataTable.tsx`, logic in `table.ts`):
  - click a heading to sort (numbers start high to low, empty values last, stable ties);
  - an optional filter box; pages of 10, 25, 50, 100 or all rows.
  - Later pages reuse it.
- **Links:** `TeamLink` (crest and name, to the club's squad), `PlayerLink` (to the profile), `ScoreLink` (to the box score), plus form badges.
- **`useView`** loads a page's data and reloads it after every Play action.
- **Shared view helpers** (`src/worker/views/common.ts`): club labels, competition names, match lines, league tables with zones, results and form. The Season lab uses them too.
- **Dashboard** (new call `getDashboard`):
  - your position, record, goal difference and last five results;
  - the next match (date, competition, venue, the opponent's position and form), what's coming up and recent results (linked to box scores);
  - a seven-row slice of your league table around you, with zones;
  - the season's top performers by average rating (3+ appearances);
  - the board's target and confidence (a coloured bar), and cash;
  - **alerts:** injured players with return dates, tired players (under 75% condition), contracts ending in June, open bids for your players;
  - the latest inbox messages.
- **Inbox:** newest first, filters by kind (board, contracts, transfers, FFP), opening a message marks it read, and "Mark all read" (new call `markAllInboxRead`). The sidebar shows the unread count.
- **Tests:** table sorting and paging, the Dashboard and mark-all-read (230 in all).
- **Browser checks:** `check-m5` adds 14 checks (the Dashboard after the first match, the mini table, board, alerts, unread count, reading messages, mark all read, sorting the top performers both ways, player links). All pass, as do M3's.

**Chunk 3: Standings, Cups, Weekly Schedule** (`src/worker/views/competitions.ts`)
- **Standings** (`/l/:lid/standings/:league/:season`):
  - league tabs and the season dropdown;
  - the live table with home and away records and form, coloured zones (champions, promotion, play-offs, relegation) and a legend.
  - Past seasons show the final table from the club-season rows, with notes: champions, promoted, play-off winners, relegated.
- **Cups** (`/l/:lid/cups/:competition/:season`):
  - both cups and the ENG2 play-offs as tabs;
  - rounds side by side, each tie with its legs, the aggregate for two-legged ties, the winner in bold, and your ties outlined;
  - a winner banner; past seasons read from IndexedDB.
- **Weekly Schedule** (`/l/:lid/schedule/:monday`): weeks run Monday to Sunday.
  - It opens on this week, or the next week with matches.
  - Previous and next buttons, and a week dropdown with each week's match count.
  - A competition filter and an "Only my club" switch; your matches are highlighted.
  - Every score links to its box score.
- **Shared:** a helper reads past seasons' rows from IndexedDB and the current season's from the cache (SPEC §12).
- **Tests:** a full-season test of all three views: the live table, play-off semis with aggregates, and the past season's final table, notes and cup (231 tests in all).
- **Browser checks:** 12 more in `check-m5` (zones and their legend, league tabs, position order, the cup's rounds and ties, the play-off tab, the schedule's days, next week, only my club). All pass.

**Chunk 4: Squad and Player profile, part 1** (`src/worker/views/players.ts`)
- **Squad** (`/l/:lid/squad/:cid`, any club via the team dropdown):
  - a summary: league position, formation, best-XI strength, average age, wage bill, counts;
  - the seniors (loanees in included) in position order: shirt number, name with badges (contract expires this June, injured, on loan), position (+ how many others he plays), age, OVR, POT, condition (coloured below 90% and 75%), market value, wage, contract end, mood, and this season's appearances, goals, assists and average rating;
  - players out on loan, and the academy.
  - Every column sorts.
- **Player profile, part 1** (`/l/:lid/player/:pid`, current and pruned-but-saved players):
  - **Bio:** OVR and POT, positions, market value, age and birth date, nationality, foot, height, shirt number.
  - **Contract:** wage, end date, seasons left, an expiry badge, the fee still to amortise, and loan terms.
  - **Condition and injury.**
  - **Mood:** the value, whether he'd negotiate, a bar per component (team success, hype, facilities, market size, playing time, loyalty, ambition) and his traits.
  - **The 22 ratings** by group, with each one's change since the last development update, and OVR at all 10 positions.
  - **Transfer history:** transfers, loans, free signings, promotions, releases, with fees.
- Rating display groups added to the ratings config (`ratingGroups`).
- **Tests:** a squad and profile test (incl. a free agent's profile); 232 tests in all.
- **Browser checks:** 13 more in `check-m5` (squad rows and summary, academy, sorting by OVR, opening a profile, its bio, contract, mood breakdown, 22 ratings, 10 position OVRs, transfer history, another club's player, the top-bar link to your squad). All pass.

**Chunk 5: Player profile part 2, Box score, Game Log** (`src/worker/views/matches.ts`, `src/ui/components/charts.tsx`)
- **Charts** (in-house SVG, no library):
  - the ratings **radar** over the config's 8 grouped axes (each the mean of its ratings), each axis labelled with its value;
  - **OVR and POT over time**, one point per development update: OVR solid and POT dashed in one blue, with a legend; hovering shows a guide line and that update's values.
- **Career stats** on the profile: a row per season, club and competition (apps, starts, minutes, goals, assists, average rating, cards), season totals when there are several rows, and the career total. Past seasons are read from IndexedDB through the `pid` index.
- **Box score** (`/l/:lid/box-score/:fid`):
  - the match header (date, competition, round, leg, venue) and links to both clubs' game logs;
  - the saved record's team stats, key events and both line-ups with ratings, with player names linking to profiles.
  - Unplayed fixtures, and other clubs' matches older than two seasons, say so instead.
- **Game Log** (`/l/:lid/game-log/:cid/:season`):
  - a club's matches in every competition: date, competition, venue, opponent, result badge and the score (to the box score);
  - the season's W/D/L and goals;
  - team and season dropdowns.
- **Shared code:** the box score component and the match-text helpers moved to `src/ui/components` for the game, the Match lab and M6's watch-live screen. The box score's formation line is optional (saved records don't keep it), and names can be links.
- **Tests:** the players test now also covers history, radar, career, the game log and box scores (played and unplayed); 232 tests in all.
- **Browser checks:** 10 more in `check-m5` (radar axes, history hover, career rows, a result's box score, box-score player links, the game log, its team dropdown, another club's box score, the Match lab still working). All pass.

**Chunk 6: Stats pages** (`src/worker/views/stats.ts`)
- **League Leaders** (`/l/:lid/league-leaders/:league/:season`): the top ten for goals, assists, average rating (min. 40% of the most appearances, at least 3), clean sheets (goalkeepers), expected goals, key passes, tackles and yellow cards; league tabs and the season dropdown.
- **Player Ratings** (`/l/:lid/player-ratings`):
  - every senior and free agent with OVR, POT and all 22 ratings (codes as headings, names on hover);
  - filters by league or free agents, and by position;
  - a name or club search, 50 a page, sortable by any rating.
- **Player Stats** (`/l/:lid/player-stats/:season/:competition`):
  - a row per player and club (a mid-season move gives two), summed over every competition or for one;
  - columns: apps, minutes, goals, assists, xG, xA, shots, on target, key passes, pass %, tackles, interceptions, cards, rating;
  - a **per 90** switch (which sets a 450-minute minimum), a minutes filter, league and position filters, and search.
- **Team Stats** (`/l/:lid/team-stats/:league/:season`), from the saved match records:
  - goals and xG for and against, shots for and against, average possession, pass accuracy, corners, fouls, cards, clean sheets.
  - Once a season's records are pruned it shows goals and clean sheets only, and says why.
- **Injuries** (`/l/:lid/injuries`): every injured player in the world, longest out first, with injury, return date and days out; a league filter and search, with your players highlighted.
- **Tests:** a stats test over a month of matches (leaders sorted, 22 ratings each, competition filtering, team stats with xG and possession averaging 50%, injuries sorted); 233 tests in all.
- **Browser checks:** 12 more in `check-m5` (leader categories and league tabs, ratings paging, position filter, 22 rating columns, name search, player stats, per 90 with its minimum, the competition dropdown, team stats, injuries order). All pass.

**Chunk 7: History, Team History, Transactions, Power Rankings, Finances** (`src/worker/views/history.ts`)
- **History** (`/l/:lid/history`): one card per finished season, newest first.
  - Each league's champions, promoted clubs (with the play-off winner), relegated clubs, Player of the Year and Golden Boot (with his goals).
  - The cup winners.
  - Everything comes from the award rows, so it stays right after players retire or clubs move league. Before the first season ends, the page says when it starts.
- **Team History** (`/l/:lid/team-history/:cid`, any club):
  - a row per season, newest first: league, finish, record, goals, points, top league scorer and honours. This season shows "now".
  - Above the table, a tally of trophies, promotions and play-off wins, with the seasons on hover. Relegations show in the season rows only.
- **Transactions** (`/l/:lid/transactions/:season`):
  - every move of the season in plain words: transfers with fees, loans, free signings, renewals, releases, contracts ending, academy promotions and retirements;
  - newest first, with filters by type and club, a search box and the season dropdown. Your club's rows are highlighted.
  - The Club lab's transfer log at `/dev` uses the same wording now.
- **Power Rankings** (`/l/:lid/power-rankings`):
  - the score is the strength of the best XI available today, plus 3 for each goal of league goal difference per game (capped at ±2);
  - also shown: full strength (nobody injured), form, goal difference per game and league position;
  - it opens on your league, and "All leagues" ranks all 62 clubs.
- **Finances** (`/l/:lid/finances/:season`), all clubs:
  - revenue (player sales included), expenses, profit, cash, squad cost as a share of revenue (red above the 70% FFP limit) and reputation, with a league filter.
  - **This season:** cash today, the wage bill at today's contracts, squad cost projected on this season's budget, and each club's FFP status (ok, warned, banned).
  - **Past seasons:** cash at the season's end and the squad cost the 30 June check measured.
- **Tests:** a full-season test of all five views, live and after the season (234 tests in all).
- **Browser checks:** `check-m5` adds 17 checks.
  - Before the season ends: the empty History, the current Team History row, transactions with fees, the type and club filters, rankings in order for one league and all 62 clubs, the finances table with FFP badges and its league filter.
  - Then it plays the season out with the Play menu and checks: the History card (champions, promotions, play-offs, relegations, awards, cups), the champion's link, the finished season in Team History, last season's transactions (retirements included) and last season's books.
  - All pass, as do the M4 checks (their transfer-log count now reads the new wording).
- **Judgment call:** ZenGM's power rankings blend team rating with margin of victory, so this score does the same: strength plus goal difference per game. It is weighted so that a goal a game is worth about 3 points of XI strength.

**Chunk 8: browser checks for every page, real-names sweep, docs, handover**
- **The browser checks moved into the repo** (`tools/browser-checks/`, run with `pnpm browsercheck`; README). Until now they lived in a temporary folder.
  - A runner builds the reference data (seed "browser"'s first club XI and the real names to look for), checks a server is up, and runs each script against it.
  - They drive the installed Google Chrome through `playwright-core`, a new dev-only dependency. It downloads no browser and isn't part of the game build. They need Chrome, so they run locally, not in CI.
- **Full-season sweep** (`sweep.mjs`, the M5 acceptance check). It starts a league as a top-flight club, then plays with only the Play menu:
  - until the summer window closes;
  - one week at a time to the winter window;
  - to the end of the season, through promotion and relegation, and into the next preseason.
- At each of the six stages it opens every sidebar page and checks:
  - the page loads without errors and shows its data where data should exist (e.g. 62 clubs on Finances, the top ten on League Leaders once matches are played, History once the season is over);
  - no real club names and no console errors;
  - a player profile and a box score open.
  - It also fails if the sidebar gains a page that the sweep doesn't check.
- **Cross-checks** at every stage:
  - the record on the Dashboard, the Standings and Team History match (P, W, D, L, points);
  - the Power Rankings position matches the Standings;
  - after the season, History's champions top the final table.
- **Big tables, timed** with a season of data: every senior and free agent (over 1,500) on one Player Ratings page in 0.3 s, sorted again by a rating in 0.3 s; the season's 366 transactions on one page; per 90 on Player Stats. Over 102 page loads the median is 64 ms and the slowest 77 ms.
- **Real names:** the build check (`pnpm build`) keeps `based_on` and every real club name out of the bundle. The browser checks read the text of every game page at every stage of the sweep, plus the Generation and Season lab pages, and find none.
- **Tidy-up:** the page list lost its chunk numbers. The placeholder now appears only on the two M6 pages (Free Agents, Transfer Market).
- **Docs:** README (the game's pages, `/dev`, `pnpm browsercheck`), this summary.

### M5 summary
- **Built:**
  - the game UI, ZenGM-style: a top bar with the Play menu, the date, phase, window and your club; a sidebar by section; team and season dropdowns; every page at its own URL;
  - Manage Leagues and the new league screen;
  - Dashboard and Inbox;
  - Standings, Cups (with the play-offs) and Weekly Schedule;
  - Squad (contract-expiry badges), the Player profile (bio, contract, mood, condition, ratings, radar, OVR/POT history, career, transfers), Box score and Game Log;
  - League Leaders, Player Ratings, Player Stats, Team Stats and Injuries;
  - History (league and team), Transactions, Power Rankings and the finances of all clubs.
  - One shared table (sort, filter, pages) and in-house SVG charts. Every page reads typed views from the worker; past seasons come from IndexedDB.
- **Decisions** (Deviations table): the Inbox moved into M5; the developer pages stay at `/dev` through M6; charts and routing are built in-house.
- **Judgment calls:**
  - no Stop button on the Play menu (a season takes seconds);
  - one team dropdown for all 62 clubs;
  - the League Leaders rating minimum (40% of the most appearances);
  - Team Stats falls back to goals and clean sheets once match records are pruned;
  - Power Rankings = XI strength plus goal difference per game.
- **Acceptance:**
  - a full season and the rollover play with only the Play menu, and every page shows its data at six points of the season, cross-checked between pages (the sweep);
  - no real club names in the bundle or on any page.
- **Known edges, for later:**
  - trading, tactics, the line-up, watching matches live and the "You're fired" screen are M6. Until then the Club lab at `/dev` is the only place to trade;
  - box scores of other clubs' matches older than two seasons are pruned by design, so those pages say so;
  - the browser checks run locally only (they need Chrome);
  - Firefox untested (see Open issues).

## M6 notes (2026-10-19)
**Plan** (approved by T): 9 chunks of about an hour.
1. Tactics: the saved line-up (formation, XI by slot, bench, sliders), slot OVR, live team ratings, drag and drop, Auto.
2. Watch live, game side: watching your next match inside the season loop, saved like a simulated match, resumable.
3. Watch live, before and during: one-match changes and Auto rotation; the feed, score, clock, stats, energy bars, speed slider and Pause.
4. Watch live, changes: the pause screen (subs, sliders, formation), half-time, injury prompts, extra time and penalties, full time.
5. The contract negotiation window and Free Agents.
6. Transfer Market: Search, Your listed players, Incoming offers, Loans; releasing players.
7. Youth Academy, and your club's Finances and Facilities (dials, ticket price, budgets).
8. The "You're fired" screen, Settings, the team schedule with Sim and Watch, the full sidebar.
9. Acceptance: three seasons run entirely in the UI (automated), all browser checks, docs and handover.

**Chunk 1: Tactics** (`src/worker/club/tactics.ts`, `src/worker/views/tactics.ts`, `src/ui/pages/Tactics.tsx`)
- **Saved line-up:** your club's tactics now hold the XI by slot and the bench order (up to 9), next to the formation and the three sliders. Saves without one get the AI's pick.
- **Who can be picked:** seniors (loanees in included) and academy players of 16+. Players who leave (sold, loaned out, released) drop out of the saved line-up on their own.
- **What applies where** (as decided in M2): the formation is your club's in every match. The line-up and sliders apply to the matches you watch; in simulated matches the AI picks them for your club, within your formation, as for every AI club.
- **The page** (`/l/:lid/tactics/:cid`, Team section):
  - a formation dropdown (the 5 MVP presets); changing it moves the same eleven into the new slots, each where his slot OVRs add up best;
  - the XI by slot (RB, LCB-style labels) with OVR in that slot (red when 4+ below his OVR), OVR, condition and age; the bench (9 places); everyone else who can play;
  - drag a player onto another place to swap them, or click one and then the other (keyboard too). Drop a player on "leave out" to take him out;
  - the three sliders with their labels and effects;
  - the seven team ratings at today's condition, on the player OVR scale, updating as you change things, with the change since your saved line-up;
  - warnings: empty slots, injured starters, starters below 75% condition, no goalkeeper on the bench, injured subs;
  - Auto (the AI's pick for an ordinary match today), Reset and Save.
  - Other clubs show the AI's pick, read-only.
- **Worker:** new calls `getTactics`, `previewTactics` (as given, re-slotted, or Auto) and `saveTactics`. Each checks the rules: MVP formations only, 11 slots, 9 on the bench, nobody twice, only your players, whole slider steps.
- **Tests:** a tactics test (the AI's pick, re-slotting, slider effects, a keeper up front, empty slots, saving, five rule breaks, a player leaving, an injured starter, another club); 235 tests in all.
- **Browser checks:** new `m6` check, 14/14 pass (the page, formation change, live ratings from a slider, drag and drop, click to swap, leave out, Auto, save, reload, another club read-only, no real names, no console errors). The full-season sweep now opens Tactics too. All other checks pass.
- **Judgment call:** team ratings are shown without a single Team OVR, whose weights are still placeholders (TEAM_OVR_WEIGHTS) and haven't been fitted yet.

**Chunk 2: Watch live, game side** (`src/worker/league/live.ts`, `src/worker/season/runner.ts`, `src/ui/pages/Live.tsx`)
- **Play → "Watch your next match"** (offered whenever your club has a match to come):
  - it plays every day before your next match, then that day's events, market and training;
  - then it holds the day before its matches (runner option `hold`). It checks each day, so a cup tie drawn on the way is the one you watch.
- **The live match:** your club plays your saved line-up and sliders. Players who can't play today (injured, or on loan from the opponent) are replaced by the best fit players left, and the bench is topped up from the AI's. The AI picks the opponent and its sliders as usual. The AI makes no in-game changes for your club: an injured player of yours limps on at low energy until you replace him (the prompt arrives in chunk 4), and if your keeper is sent off an outfielder goes in goal.
- **Saved as it goes:** the engine state, its random stream included, is stored in the save (meta row "live") every 5 match minutes, at breaks, after every change, and at the end.
  - A closed or reloaded game resumes from that point.
  - The minutes since the last save replay exactly as they were, so there are no do-overs. Changes you made are never lost.
- **Full time:** the held day is finished with your live result (runner option `resume`): the day's other matches, gate money, prize money, hype, tables, board, cup draws and stats, through the same code as a simulated day.
- **While a match is live,** the Play menu waits, and the six market actions (renew, bid, sign, answer a bid, loan, the wage control) refuse with "Finish your live match first." The top bar shows a "Live match" link.
- **Worker:** new calls `getLiveMatch`, `stepLiveMatch` and `changeLiveMatch` (the in-match changes, used from chunk 4). `squadPlay` now separates picking the squads (`prepare`) from applying a played match to the players (`finish`).
- **A first live screen** (`/l/:lid/live`): score and clock, Kick off / Play / Pause, To full time, the commentary and a few stats; at full time, links to the box score and the Dashboard. Chunks 3 and 4 build the full screen on it.
- **Tests** (3 new, 238 in all):
  - watching with the AI managing your club gives exactly the same saved day as simulating it: every result, match record, player, club, club-season row, stat row, message and transaction;
  - your line-up and sliders are used, the game holds, and the match is saved at full time;
  - an interrupted match resumes from its last save to the identical result.
- **Browser checks:** `m6` adds 9 (watch from the Play menu, the waiting Play menu and the live link, Kick off and Pause, a reload mid-match resuming, To full time, the box score, the Play menu back). 23/23 pass, and all other checks pass.
- The 20-season calibration gate (`calibrate --world --check`) still passes: simulated play is unchanged.
- **Fixed on the way:** hype after a watched match used the clubs' strength after the match's injuries. The watched path now picks the squads too (unused), so the day's caches match a simulated day.

**Chunk 3: Watch live, before and during** (`src/ui/pages/Live.tsx`, `src/ui/components/LineupEditor.tsx`, `src/worker/league/live.ts`)
- **Before kick-off:** the live page opens on your line-up for this match.
  - It uses the Tactics editor (now a shared component): drag or click to swap, the formation, the sliders and the team ratings.
  - Changes apply to the match at once, for this match only; your saved Tactics stay as they are. Only players fit to play are listed.
  - **Auto** = the AI's rotation for this fixture (with its importance and fixture congestion, as in a simulated match). **My saved line-up** goes back to your Tactics.
  - Each change restarts the match from kick-off with the new team on the same random stream. Re-applying the same line-up gives the identical match.
  - The opponent's XI and formation are shown alongside. Changes are refused once the match has kicked off ("make changes at a pause", chunk 4).
- **During the match:**
  - the scoreboard with crests, score, clock (Kick-off, Half-time, Full time) and the scorers under each team;
  - Play / Pause, a **speed slider** (Slow, Steady, Normal, Fast, Very fast: 1 to 12 possessions a step), remembered in your browser, and To full time;
  - the commentary, newest first, with badges for goals, cards, subs and injuries;
  - stats: a possession bar, shots, on target, xG, pass accuracy, corners, fouls and cards;
  - both teams' players with energy bars (green, amber below 70, red below 50), bookings and injuries, subs and windows used, and the bench.
- **Worker:** new calls `getLiveLineup` and `setLiveLineup` (modes as given, re-slotted, Auto, saved). `TacticsMode` gains "saved" (the Tactics page's Reset can use it too).
- **Tests:** a pre-match test (the editor shows the match's line-up; a swap applies; Auto and saved; outsiders left out; no change after kick-off; an unchanged restart gives the identical result); 239 tests in all.
- **Browser checks:** `m6` adds 5 (the pre-match screen and the opponent's XI, a change and My saved line-up, the speed and the line-up surviving a reload, energy draining with the newcomer playing, the scorers). 28/28 pass, as do all the other checks.
- **Judgment calls:** the speed is a per-browser setting (local storage), not saved in the league. Empty slots in the pre-match line-up are filled at once with the best fit player, since a match needs eleven.

**Chunk 4: Watch live, changes** (`src/worker/league/live.ts`, `src/ui/pages/Live.tsx`)
- **Play stops by itself:**
  - at half-time, before extra time, and at extra time's half-time;
  - when one of your players is injured (and not yet replaced) or sent off.
  - The worker steps one possession at a time and stops at the first of these; the view says why. "To full time" plays straight on with no stops.
- **The changes screen** opens whenever play is paused (by you or by itself):
  - a title (Paused, Half-time, Extra time to come, Extra time: half-time, Injury, Sent off) and a plain message for injuries and red cards. A keeper sent off: an outfielder has gone in goal, so bring on your reserve keeper for him;
  - **substitutions:** each player on the pitch (energy, bookings, injured) with a "Replace with" list of the bench (position and OVR);
  - the subs and windows left: at a break "substitutions now don't use a window", during play "use 1 of your N remaining windows: make them all together" (all subs applied at once use one window, as the engine's rule);
  - formation and the three sliders;
  - **Make changes** (one call to the engine) and **Resume**.
- **Penalty shoot-outs** run at the end of extra time as before; the scoreboard shows the shoot-out score, and the commentary each kick.
- **Worker:** `stepLiveMatch` gains `autoPause`; new pure `pauseFor` decides the stops. The players map carries OVR for the bench list.
- **Tests** (3 new, 242 in all):
  - `pauseFor` rules (your injuries and red cards only, the three breaks, nothing at full time);
  - a watched match stops at half-time; a free half-time sub; a sub during play uses one window; formation and sliders change; a bad slider is refused; To full time runs on;
  - real level knockout matches pause at half-time, before extra time and at its half-time, in that order.
- **Browser checks:** `m6` adds 6 (the changes screen mid-match, a sub using a window, formation and slider changes, the half-time stop, a free half-time sub). 34/34 pass, as do all other checks.
- **Judgment call:** auto-pause stops only for your own team's injuries and red cards, not the opponent's, and not for goals.

**Chunk 5: contract negotiation and Free Agents** (`src/ui/components/ContractModal.tsx`, `src/ui/pages/FreeAgents.tsx`, `src/worker/views/market.ts`)
- **One contract window** (SPEC §7.6) for:
  - renewing your players;
  - a transfer: first agree a fee with his club (bid, see the counter or the refusal, bid again), then personal terms;
  - a free agent.
- **It shows:**
  - his position, age, OVR, POT, value and current deal;
  - your transfer budget, wage room, squad size and squad cost against the FFP limit;
  - his mood (the same breakdown as the profile) and whether he will talk;
  - the wage he asks for 1 to 5 years, with the end date each gives. Asks over your wage room, or renewals that don't run past his current deal, are greyed out.
- **What blocks a deal is said up front:** a closed window (renewals and transfers), a player who won't negotiate, an FFP ban, or a full squad. A full squad can still agree a fee, since a sale may follow.
- **Opened from:**
  - the Squad page: "Contract" on your players, "Bid" on another club's;
  - the player profile: "New contract", "Make a bid" or "Offer a contract";
  - Free Agents.
  - Esc or "Walk away" closes it.
- **Free Agents page** (`/l/:lid/free-agents`, now in the sidebar):
  - every unsigned player with position, age, OVR, POT, value, his lowest yearly ask at your club, his mood toward your club, and days unsigned;
  - your wage room and squad size;
  - filters by position, plus "only willing players within my wage room", and search.
- **Fixed (spec alignment):** you can now sign free agents outside the windows, as SPEC §3.1 says. The M4 code had required an open window. Renewals and transfers still need one. AI clubs still sign free agents only on their market days, which fall inside the windows (see Open issues).
- **Shared:** the mood breakdown moved to `src/ui/components/Mood.tsx`. Contract talks now carry the squad size.
- **Tests:** a free-agents test (the list and its asks; a signing outside a window; renewals and bids still need a window); 243 tests in all.
- **Browser checks:** `m6` adds 13:
  - the Free Agents page, its filter and signing a free agent;
  - a renewal from the Squad page;
  - a lowball bid refused, then a fair bid agreed and personal terms (blocked by a full squad in this run);
  - outside a window: renewals wait, but free agents can still be signed;
  - the profile button.
  - 47/47 pass. The sweep now opens Free Agents too, and all other checks pass.

**Chunk 6: Transfer Market, the transfer list, releasing** (`src/ui/pages/TransferMarket.tsx`, `src/ui/components/MarketDialogs.tsx`, `src/worker/views/market.ts`, `src/worker/league/market.ts`)
- **Transfer Market page** (`/l/:lid/transfer-market/:tab`, now in the sidebar). The window, transfer budget, wage room, squad size, squad cost against the FFP limit and anything owed to released players sit above four tabs:
  - **Search:** other clubs' players by position, league, minimum OVR and maximum age (the best 100), with value, wage and contract end; **Bid** opens the contract window, **Loan** proposes a loan in.
  - **Your listed players:** the transfer list (asking price, date listed, open bids), and all your players with **List**, **Loan out** and **Release**, plus the released players still being paid.
  - **Incoming offers:** open bids for your players with Accept and Reject, and every bid this season both ways.
  - **Loans:** your players out on loan and the loanees at your club, with the loan club's wage share.
- **The transfer list** (T's decision): you set an asking price. On their market days AI clubs that need his position bid between 85% and 100% of it (no more than they think he's worth or can afford). He's preferred over other candidates, a listed player isn't held back by your squad size, and his bids don't count against the two-open-bids cap. Unlisted players still get the occasional bid, as before. Moving club takes him off the list.
- **Releasing** (T's decision, as ZenGM):
  - he joins the free-agent pool at once;
  - the club keeps paying his wage monthly until his contract would have ended;
  - any transfer fee not yet amortised goes on being amortised on the same schedule.
  - Both count in the wage room, the squad cost and the FFP books, so a release frees a squad place and saves nothing. Not loanees or academy players.
  - The release dialog says what it still costs.
- **Profile buttons** for your players: List for transfer (or the listed price), Loan out, Release.
- **Judgment call:** the first draft wrote the unamortised fee off at once. The test showed that briefly freed wage room the season-end FFP check would take back. Keeping the fee on its schedule, like the wage, means releasing leaves the books exactly as they were.
- **Worker:** new calls `getTransferMarket`, `listPlayer` and `releasePlayer`; the search gains a league filter. Clubs carry `released` (wage, end date, fee left); players carry `listed`.
- **Tests** (3 new, 246 in all):
  - what a club still owes over time;
  - a release: he leaves, the wage room doesn't rise, his fee stays on schedule, and over a window the club pays exactly the wages and amortisation it would have paid keeping him;
  - listed players draw AI bids between 85% and 100% of the price; unlisting works.
- **Browser checks:** `m6` adds 10 (search and its filter, listing, the release dialog and the release, the agreed transfer completing once a place is free, a loan out answered, the Loans tab, incoming offers, no real names). The sweep now opens the Transfer Market too.

**Chunk 7: Youth Academy, Finances & Facilities** (`src/ui/pages/Academy.tsx`, `src/ui/pages/ClubFinances.tsx`, `src/worker/views/club.ts`, `src/worker/league/club.ts`)
- **Youth Academy** (`/l/:lid/academy`, Team section): your prospects, best potential first. Each shows age, nationality, OVR, POT, the change at the last development update, and the wage a first pro contract would pay him.
  - **Promote:** his first professional contract, three seasons (to 30 June three seasons on). Not with a full squad.
  - **Release** (with a confirm): he joins the free-agent pool.
  - **To loan a prospect out:** promote him first, then Loan out (judgment call: academy players have no contract to lend on).
  - Players 18 or older on the coming 1 July carry a "decide by 1 July" badge.
- **Academy decisions** (T's decision): the club no longer promotes your outstanding 17-year-olds early; that stays an AI-club rule. On 1 July, anyone 18+ you left undecided gets the AI rule (promoted if good enough and there's room, otherwise released). A **1 May inbox reminder** lists them. The harness has no user club, so calibration is unchanged.
- **Finances & Facilities** (`/l/:lid/club-finances`, Team section):
  - **Books:** cash; this season's income (gate, TV, prize money, commercial, player sales) and spending (wages, fees, the four dials); the amortisation booked; cash at the end of each season (an in-house line chart, hover for values).
  - **FFP gauge:** squad cost (wages and amortisation, released players included) against the 70% limit, last season's ratio, any warning or ban, and the facilities level.
  - **Budget dials:** four sliders, 0–100, each with its cost a season as you slide, what it does, and its effect now (relative to other clubs, measured each preseason). Costs change as soon as you save.
  - **Ticket price** (T's decision): your own price, or Auto (the AI's fair price), set until your first home match and then fixed for the season. A table shows the expected crowd and gate per league match at six prices. Your own price carries on from season to season; Auto is re-priced each preseason.
  - **Transfer budget and wage room** with the fees/wages control (5% steps).
- **Ticket prices now move crowds** (SPEC §6.2: attendance "driven by … ticket price", missing until now because every club charged the fair price): the crowd is scaled by (price ÷ fair price) to the power −1.5, within the ground's capacity. **Judgment call:** with 1.5, dearer tickets lose money unless the ground would be full anyway; a club with spare demand can raise prices a little and still sell out. The AI charges the fair price, so its crowds and the calibration are unchanged (checked: same numbers).
- **Worker:** new calls `getAcademy`, `decideAcademyPlayer`, `getClubFinances`, `setBudgetDials`, `setTicketPrice` and `setClubWageShare`. Clubs carry `ticketAuto`. A new season event fires the 1 May reminder.
- **Tests** (3 new, 249 in all):
  - the academy: listed by potential; the user's 17-year-olds are left alone while AI clubs promote theirs; the May reminder; promote (three seasons) and release;
  - attendance falls with price;
  - the club's books: dials and their cost, the fees/wages split, the ticket price set, back to Auto and set again, then locked after a home match.
- **Browser checks:** `m6` adds 11 (setting a ticket price in preseason, the academy and its release confirm, a full squad holding promotion, the books and chart, the FFP gauge, the price locked after a home match, dials saved across a reload, the fees/wages split). 67/67 pass. The sweep opens both new pages, and all other checks and the calibration gate pass.

**Chunk 8: "You're fired", Settings, next-match buttons, the full sidebar** (`src/ui/pages/Fired.tsx`, `src/ui/pages/Settings.tsx`, `src/ui/components/PlayButtons.tsx`)
- **"You're fired" screen** (`/l/:lid/fired`, SPEC §6.5): the game takes you there when the board sacks you.
  - It shows the club that sacked you, the date, your league position and record, and board confidence.
  - Each of the 1–3 job offers is a card: league and position, squad strength, reputation, and what its board will expect, with **Take the job**.
  - You can also start a new league or go back to Manage Leagues. Meanwhile a banner on every page says play resumes once you take a job, with a link back to the offers.
- **Settings** (`/l/:lid/settings`, under Tools; T's decision): rename the save (the top bar and Manage Leagues follow), and delete the league after a confirm. The live-match speed stays a slider on the Watch live screen.
- **Your next match:** **Watch live** and **Simulate it** buttons on the Dashboard's next-match card and on your club's Game Log for the current season (the team schedule in SPEC §11), next to the date. They use the same Play actions as the top bar's menu.
- **The full sidebar:** every page is built, so the greyed "M6" entries and the placeholder text are gone; unknown addresses say "Page not found".
- **Worker:** new calls `getJobOffers` and `renameLeague`. Offer cards use the board targets' labels from the league config.
- **Tests:** one new (the fired view with the sacking club, record and offers; renaming in the save and the save list; an empty name refused); 250 tests in all.
- **Browser checks:** `m6` adds 7 (nothing greyed in the sidebar, Simulate from the Dashboard, Watch live from the Game Log, the fired page while in a job, renaming, deleting the league). 74/74 pass. The sweep opens Settings too, and all other checks pass.

**Chunk 9: acceptance, the three-season career** (`tools/browser-checks/career.mjs`)
- **`pnpm browsercheck career`** runs Lancashire Rovers (seed "career") for three seasons using only the screens. Each preseason and summer window it:
  - sets tactics (Auto plus a slider) and its own ticket price, and the fees/wages split to 60%;
  - bids for a cheap second-tier player within the budget and signs him;
  - releases the least valuable seniors to make room, promotes the best prospect, signs a free agent, renews a final-year contract;
  - lists one wanted player at 85% of his value and offers a bench player on loan to second-tier clubs;
  - answers bids week by week through the window (accepting the first);
  - watches the next match live: kicks off on the fastest speed, stops at half-time, makes a substitution and a slider change, plays to full time;
  - plays the season out, then promotion and relegation and the next preseason. If the board sacks the user, it takes the first job offer and goes on.
- **The checks read the game's own records:** the Transactions log for every season, filtered to the user's club by the exact wording of each kind of move. Every kind must be there: free agents and a transfer in, a sale, a loan out, a renewal, an academy promotion. The screens must also record a saved tactic and a live match changed at half-time each season, History must hold every finished season, and there must be no real names and no console errors.
- **One run:** in season 1 it bought a player, promoted a prospect, signed a free agent, renewed a contract, loaned a player out, sold the listed player for €790k, watched a 2–0 win, and was then sacked (the board had little patience after the releases and the sale). It took the job at another second-tier club and played two more seasons there. 11/11 pass in about 45 seconds of play.
- **Fixed on the way (the transfer list):** the career showed that listed players at a second-tier club drew no bids, even at 30% of their value. Each AI club only looks at the best 60 players within reach for the position it needs, and mid-level players never made that list. A listed player who fits a club's need is now always considered (T's decision: AI clubs that need his position bid around the price). Listed this way, the club's two best players both drew bids at their asking price within the window. Weaker players still draw none, because no one would be improved by them. A new test covers it. The harness has no user club, so calibration is unchanged (checked).
- **Tests:** 251 in all. **Browser checks:** all seven scripts pass (276 checks).

### M6 summary
- **Built:**
  - **Tactics:** the saved line-up and sliders, drag and drop, live team ratings, Auto.
  - **Watch live:**
    - "Watch your next match" holds the match day and runs your match possession by possession, saved as it goes, so a reload resumes it with no do-overs;
    - pre-match changes for this match only and the AI's rotation; a speed slider; energy bars, stats and commentary;
    - stops at half-time, before extra time, and for your injuries and red cards; a changes screen with subs (windows counted), formation and sliders.
    - At full time the day finishes through the same code as a simulated day.
  - **One contract window** for renewals, transfers (fee, then personal terms) and free agents. **Free Agents** page.
  - **Transfer Market:** search, the transfer list, incoming offers, loans; **releasing** players.
  - **Youth Academy** (promote, release, the 1 May reminder) and **Finances & Facilities** (books, cash chart, FFP gauge, dials, ticket price, the fees/wages split).
  - **"You're fired"** screen, **Settings**, Watch and Simulate buttons for the next match, and the full sidebar.
- **Decisions** (T, Deviations table, design doc #55–#56):
  - releasing as ZenGM;
  - undecided academy players get the AI rule on 1 July, with a May reminder;
  - ticket price set in preseason and locked after the first home match;
  - Settings holds rename and delete, with the live speed as a slider;
  - the transfer list;
  - a live match resumes after the game is closed;
  - AI clubs sign free agents only in the windows.
- **Judgment calls:**
  - a release keeps the fee on its amortisation schedule, so it saves nothing;
  - ticket prices move crowds (elasticity 1.5, AI unaffected);
  - auto-pause stops only for your own injuries and red cards;
  - to loan out an academy player, promote him first;
  - no single Team OVR yet (its weights are still unfitted).
- **Fixed to match the spec:** free agents can be signed outside the windows.
- **Acceptance** (MILESTONES M6): the three-season career passes. It signs, sells, loans, renews, sets tactics, watches and changes a match live, and promotes academy players, all through the screens and confirmed in the game's own records.
- **Known edges, for later:**
  - the AI bids for your listed players only when they would improve one of its positions, so weak players don't sell, by design;
  - a full squad blocks signings until you sell, loan or release, and the windows' pace means a sale can take weeks;
  - the developer pages at `/dev` are removed in M7, as agreed;
  - Firefox untested.

## M7 notes (2026-10-20 to 2026-10-21)
**Plan** (approved by T): 6 chunks of about an hour.
1. Remove the developer pages (`/dev`) and their checks; show the version in the app.
2. Performance pass: one season at a 4× CPU slowdown, ten seasons (time and save size), retention and pruning checked; fixes.
3. Bug bash I: edge states (new league, promotion and relegation, extra time and penalties live, FFP ban, negative cash, retired and pruned players, empty pages, the sacking flow).
4. Bug bash II: two tabs, the fallback worker, reloads mid-action, long names and tables, errors in plain words.
5. Laptop layout: every page at 1280×720 and 1366×768 and with the narrow sidebar.
6. Release v0.1: How to play, CHANGELOG, PROGRESS, all checks, PR, merge, tag v0.1.0, production checks; T tests Firefox.

**Chunk 1: the developer pages removed; the version shown**
- **Removed** (decided for M7):
  - the `/dev` address and its four tabs (Generation, Match lab, Season lab, Club lab);
  - their worker views (`inspector`, `matchLab`, `seasonLab`, `clubLab`), their ten API calls and 20 types that only they used;
  - their browser checks (M1, M3, M4) and the Tools link to them.
  - `/dev` now says there's nothing there.
- **Kept and moved:** the new-league club list (`views/newLeague.ts`) and the player search behind the Transfer Market (`views/market.ts`). The calibration tools stay as they were.
- **Tests that used the dev views** were rewritten to check the same things through the game:
  - a reloaded save passes the world checks and matches each club's strength;
  - the squad view serves squads and academies;
  - the Transfer Market search and the fees/wages control work.
- **Version:** 0.1.0 in package.json, built into the app (`__APP_VERSION__`) and shown on Manage Leagues and in Settings. A new M5 check reads it.
- **Bundle:** 1.2 MB of assets after the removal.
- **Tests:** 251, all pass. **Browser checks:** game pages 89/89, management screens 74/74, full-season sweep 43/43, career 11/11.

**Chunk 2: performance pass** (`tools/browser-checks/perf.mjs`)
- **New `perf` check:** a new league played for ten seasons through the Play menu. Each season (preseason to the next preseason, rollover included) is timed, the save measured, the retention rules checked, and the heaviest pages timed at the end.
- **Finding (T confirmed the × 4 method):** Chrome's CPU throttling doesn't reach the game's worker. Measured: a full season takes about 2.3 s at 1× and at 4×, with the SharedWorker and with the dedicated worker alike; only the page slows down. So the check uses **each season's measured time × 4** as the "mid-range laptop" figure. That is slightly pessimistic, since a real slower machine wouldn't slow everything 4×.
- **Results** (this Mac, seed "perf", a top-flight club; sacked once in season 2, it took the job offered):

| Budget (SPEC §14) | Result | Limit |
|---|---|---|
| One headless match | 0.91 ms (`pnpm calibrate`) | < 5 ms |
| A full season, rollover included, ×4 | 16.0–18.1 s (4.0–4.5 s here) | < 60 s |
| Save after 10 seasons | 50.6 MB | < 100 MB |

  - **Seasons barely slow down as the save grows:** 4.0 s in season 1, 4.5 s in season 10.
  - **The save:** about 18 MB after one season, 51 MB after ten. Chrome's estimate goes up and down as it compacts its storage: 57 MB in season 9, 51 MB in season 10.
- **Retention and pruning** (SPEC §12), after ten seasons:
  - other clubs' full match records are gone after two seasons, and the user's (377 old matches) are kept;
  - no retired player that should have been pruned is left (668 retired players kept for their awards, peaks or spells at the user's clubs), and no stat rows without a player;
  - players 2,682 → 2,912 (+9%).
- **The heaviest pages after ten seasons:** History 113 ms, Team History 215 ms, a past season's Transactions 101 ms, Player Stats 121 ms, League Leaders 113 ms, Finances 100 ms, Player Ratings 104 ms, an old award winner's profile 111 ms (limit set at 1 s).
- **Nothing was over budget,** so no engine or page changes were needed.
- **CI:** it took 12 minutes in one job (unit tests about 5 minutes, the two calibration harnesses about 6). It now runs two jobs side by side ("Lint, test, build" and "Generation and calibration"), so the wait should drop to about 6–7 minutes. No check was dropped.

**Chunk 3: bug bash I, edge states** (`tools/browser-checks/edges.mjs`)
- **New `edges` check (22 checks):**
  - **A new league:** League Leaders, Player Stats, Team Stats, History, Injuries and the box score of an unplayed match each say why they're empty. The Inbox has its opening messages.
  - **A season with the weakest top-flight club:**
    - Every cup tie is watched live at top speed until one is level after 90 minutes. It stops for extra time and plays to the end.
    - The Dashboard, Standings and Team History are right after the rollover.
    - Whoever went down or up (seed "edges": Suffolk Town down, Pennine Clarets up) plays in their new league, and their Team History says why.
    - The board sets a new target.
  - **Negative cash, then an FFP ban,** written into the save while the game is closed:
    - the Transfer Market, the contract window, Finances & Facilities and Free Agents each say what is blocked and until when;
    - Finances & Facilities shows the cash in red.
  - **Addresses that name nothing:** an unknown player, an unknown page inside a league, and a league that doesn't exist.
  - No real club names and no console errors.
- **Fixes:**
  - **Pruned players kept their names.** Retired players pruned from the save (SPEC §12) left "#12345" in old box scores of the user's matches, and their profile links gave a red error. The save now keeps a small name list of pruned players. Box scores show the name, and the profile says calmly "X retired in 2031 and is no longer in the save." An unknown player number gets the same calm style.
  - **Negative cash is said up front.** Before, the Transfer Market showed only a €0 budget, and a bid failed with "Negative cash: transfers are frozen (SPEC §6.4)". Now the market shows "Cash below zero: transfers frozen", the contract window explains it before you bid, and the error is in plain words. The rule itself is unchanged (SPEC §6.4).
  - **Player Stats before the first match** said "Nobody matches these filters". It now says no matches have been played yet.
- **Checked and fine, no change:**
  - extra time live;
  - promotion and relegation on the Dashboard, Standings, History and Team History;
  - the FFP ban on every screen that mentions it;
  - empty Injuries and History;
  - the sacking flow (covered by the `career` check).
- **Not reached in the browser:** a live penalty shootout. In this seed the tie was settled in extra time. Shootouts are covered by the engine tests (`rules.test.ts`), and the live scoreboard shows "pens x–y" from the same match state.
- **Noted for chunk 4 (errors in plain words):** a few game messages still showed raw dates such as "until 2028-01-31"; fixed in chunk 4.
- **Tests:** 251, all pass. **Browser checks:** m5, m6, sweep, career and edges all pass (perf unchanged since chunk 2).

**Chunk 4: bug bash II, tabs, reloads, long names, plain words** (`tools/browser-checks/tabs.mjs`)
- **New `tabs` check (20 checks):** two tabs on one league; two leagues in two tabs; a league deleted in another tab; reloads during a season, during the rollover and during league creation; the longest names on every page; the fallback (one-tab) worker; bad addresses.
- **Two tabs, fixes:**
  - **Every change reaches every tab.** Before, only Play actions refreshed other tabs; a signing, a sale, a listing, a dial or a read message in one tab left the other tab stale. Now every change does, except saving tactics: only the Tactics page shows it, and its editor starts over on a refresh.
  - **Play shows in every tab.** While one tab plays, the others show "Playing…" and can't start a second Play. Before, a second Play queued behind the first and then failed with a technical message.
  - **Two leagues in two tabs (judgment call, closest to ZenGM):**
    - The worker keeps one league open at a time. The league opened most recently, by arriving on its pages or with "Open this league here", is the open one.
    - Tabs showing another league stop and say why, with "Open this league here" and "Back to your leagues". Their calls are refused instead of switching back; before, two tabs could take turns forever.
    - An action under way (a season, a rollover) finishes and is saved before the switch. Before, opening another league closed the save in the middle of it.
  - **A league deleted in another tab** says so, with a link back to the leagues.
- **Reloads:**
  - A Play stretch is saved in one go when it ends. A reload in the middle of "Until the end of the season" leaves the game where that Play started, never half-played.
  - **The rollover** now saves the new season in one write. Pruning runs afterwards: stat rows first, then the players, so a page closed in between leaves nothing broken, and the next rollover catches up.
  - **A league whose creation was interrupted** says plainly what to do: delete it on Manage Leagues and start a new one. In the test, the reload came before the league was saved, so nothing was left behind.
- **Long names:**
  - League names are capped at 60 characters when a league is created, as on rename. The top bar shortens a long name with "…".
  - With a 60-character league name and the longest generated player name (about 35 characters), no page is wider than the window.
- **Errors in plain words:**
  - Messages the game means to show are now a separate kind (`GameError`, `src/common/errors.ts`) and read as written.
  - Anything else is a bug and reads "Something went wrong (…). Reloading the page usually fixes it."
  - One shared helper (`src/ui/errors.ts`) replaces 15 copies.
  - **Rewritten:**
    - the Play-option error ("That isn't possible now…");
    - unknown league, club and match ("There's no club 9999 in this league.");
    - retired or departed players in the market, an old bid, the contract length, the job offer;
    - the start-up messages ("the game worker" became "the game").
  - **Dates in game messages** now read "31 Jan 2028" instead of "2028-01-31": the FFP ban, loans, releases, academy contracts, injuries on Tactics, and AI bids. They use one format (`formatDay`) that doesn't depend on the browser's language. The UI uses the same format (so September is "Sep" everywhere).
  - **A page that crashes while drawing** shows a message and a reload button instead of a blank screen; the top bar and sidebar keep working.
  - **If the game engine fails to load or stops,** pages say so instead of loading forever.
- **Tests:** 254, all pass (new: the RPC failure path, `formatDay`, the league switch, the Play marker). **Browser checks:** m5, m6, sweep, career, edges and tabs all pass (perf unchanged since chunk 2).

**Chunk 5: laptop layout** (`tools/browser-checks/layout.mjs`)
- **New `layout` check (18 checks).** Four sizes, each as much of the screen as the browser actually shows: the screen minus the browser's tabs and toolbar (about 87 px), the taskbar (about 48 px) and a 17 px scrollbar.

| Screen | Window checked |
| --- | --- |
| 1280×720 | 1263×585 |
| 1366×768 | 1349×633 |
| 1366×768 at Windows' 125% scaling | 1076×506: the tightest fit beside the sidebar (992–1199 px) |
| A window under 992 px (half a 1920 screen) | 960×600, sidebar behind Menu |

  - **Every page at every size:** the 23 sidebar pages, a player profile, a box score, Live, New league and Manage Leagues. The league pages are checked twice: after the first match (summer window open) and at the next preseason (a season of history).
    - No page is wider than the window.
    - No content is wider than its card or column. Content that overflows a card runs over its neighbours without widening the page, so this needs its own test.
    - Wide tables may scroll inside their own box.
  - **The top bar,** with a 60-character league name and the longest club name on offer (Warwickshire Sky Blues): one row, with the Play button, date, phase, window badge, league name and club all showing, also while "● Live match" is there.
  - **Menus and dialogs:** the Play menu, the contract window (a free agent and a bid), and the List, Loan and Release dialogs fit.
  - **Live, at 1280×720 and at 125%:**
    - before the match, Kick off is on screen;
    - at half-time, the scoreboard, the controls and the changes screen are on screen;
    - while playing, the newest commentary is on screen;
    - at full time, the result is on screen.
  - **Under 992 px:** the sidebar starts hidden, opens and closes with Menu, and closes when a page is picked.
- **Fixes** (classes and markup only; no game logic changed):
  - **The top bar wrapped to two rows.** It happened at 1280 px when the Live link and the window badge both showed, and at every width under 1200 px. Under 992 px the second row also covered the top of the opened sidebar. It is now always one row:
    - the league name gives way first (shortened with "…");
    - under 1200 px, the window badge reads "Window until 31 Aug", with the full text on hover;
    - under 992 px, the Menu button sits in the top bar instead of the "Soccer Sim" title. Before, it sat at the top of the page, where the opened sidebar covered it, so the only way to close the sidebar was to pick a page;
    - the "N matches played" note after a Play shows from 1400 px only.
  - **Dashboard: "Coming up" and "Recent results" overlapped.**
    - They sat side by side, and a row with two club names didn't fit: the tables ran 160–230 px into the next card at every laptop size, and at 1400 px too.
    - They now sit one above the other.
    - Under 1200 px, the right-hand column (the board, alerts and inbox) moves below the main one; before, that happened only under 992 px.
- **Checked and fine, no change:** every other page, New league, Manage Leagues, the dialogs, the Play menu, and Live (at full speed the newest commentary starts about 210 px above the bottom of a 1280×720 window).
- **Tables that scroll sideways** (allowed): Player Ratings at every size, since it has every rating column. At 125%, Finances and Squad scroll too.
- **Tests:** 254, all pass. **Browser checks, all pass:**
  - m5 90/90, m6 74/74, sweep 43/43, career 11/11;
  - edges 22/22, tabs 20/20, layout 18/18;
  - perf 9/9: a season takes 4.0–4.5 s here (about 18 s at ×4), and the save is 38.7 MB after ten seasons.

**Chunk 6: release v0.1**
- **Decisions** (T, design doc #58–#59; Deviations table; SPEC §11, §13; OPEN_QUESTIONS A9):
  - **#58, one league open at a time** (the chunk 4 judgment call, approved): the league opened most recently on purpose is the open one, and tabs showing another league stop.
  - **#59, How to play is a page in the game,** linked from Manage Leagues and the sidebar's Tools; the README points to it.
- **How to play** (`src/ui/pages/HowToPlay.tsx`): one short page in eight parts: starting; playing through a season; squad and tactics; watching live; transfers, loans and contracts; the academy; money and the board; saves.
  - It opens on its own at `/how-to-play` (from Manage Leagues, which also suggests it when there are no saves yet) and inside a league at `/l/:lid/how-to-play` (from Tools, with the top bar and sidebar kept).
  - Checks: `m5` opens it from Manage Leagues; `sweep` opens it from the sidebar at all six points of the season; `layout` checks both versions at every size.
- **`CHANGELOG.md`:** the v0.1.0 entry (what the game does, the known limits). **README:** points to the game, How to play and the changelog; the browser-check list is complete.
- **Gates, all pass, run one at a time:**
  - `pnpm lint`; `pnpm test` (254 tests); `pnpm build` (no real club names in `dist/`);
  - `pnpm calibrate --check`, `pnpm calibrate --world --check` and `pnpm generate --check`;
  - browser checks: m5 91/91 (new: How to play from Manage Leagues), m6 74/74, sweep 43/43, career 11/11, edges 22/22, tabs 20/20, layout 18/18;
  - perf 9/9: the worst season is 4.5 s here (about 18 s at ×4), the save is 43.5 MB after ten seasons, and the slowest page is Team History at 197 ms.
- **Next:** T tests locally, Firefox included. Then the push, the PR and CI, the merge, the v0.1.0 tag and GitHub release, and the production checks.

**Chunk 6, part 2: T's local-test feedback** (2026-10-21)
- **What happened:** T tested v0.1 locally and had his list built in a separate session. This session reviewed the changes against the code and documented them. The feedback list:
  - too many red cards; are red-carded players suspended?
  - see ratings and stats on Squad and Tactics without opening the profile; flags next to names;
  - a ratings-history table on the profile instead of the OVR/POT chart (ZenGM style);
  - injury length on hover; shorter status tags, and more of them; more Transfer Market filters;
  - whole result rows in green, yellow or red;
  - a formation view on Tactics, and a pitch of positions on the profile;
  - clickable players in the inbox.
- **Discipline: a new rule** (SPEC §8.9, design doc #60):
  - **Before, a sending-off had no suspension.** Now a second yellow brings a one-match ban and a straight red three.
  - Bans are served in the club's next domestic fixtures (league, cups, play-offs), also while injured. They carry across seasons and transfers. The match of the sending-off doesn't count.
  - Suspended players can't be picked in simulated or watched matches: the AI's matchday squads, the saved tactics and the live line-ups all leave them out. One code path serves both (`season/discipline.ts`).
  - **Saved:** a new optional field `players.suspension` {remaining, date}. Older saves start without bans: no migration, and past red cards aren't reconstructed.
  - Not built: bans for a build-up of yellow cards.
- **Fewer red cards** (engine tuning, no target changed):
  - straight red per foul 0.0019 → 0.0016, in a chance 0.0038 → 0.0032; a booked player's second-yellow factor 0.45 → 0.35;
  - reds per match 0.180 before (3,000-match neutral sample), 0.137 after (9,999 matches; target 0.140, accepted 0.08–0.20); all engine gates pass;
  - a first, stronger cut measured 0.121 and failed the peak-age and transfer-exploit gates.
- **Squad and Tactics:**
  - **Ratings cards:** a chart-icon button opens a card with all 22 colour-scaled ratings and basic season stats, without leaving the page. The card stays inside the window, above table clipping. Escape, a close button or an outside click close it; it never triggers a line-up swap.
  - **Nationality flags:** flat SVGs bundled with the game (MIT-licensed flag-icons in `public/flags/`; licence kept, attribution in `docs/ASSETS.md`; no outside requests). England, Scotland, Wales and Northern Ireland are separate. They have their own column, and also show on Academy, Transfer Market search, Free Agents, Player Ratings and the profile.
  - **Rating changes:** signed OVR/POT changes since the last update of the previous season. New players show none.
  - Tactics also shows POT and the season's appearances, minutes, goals, assists and average rating.
  - **Status tags** (SPEC §11): I (injured), E (expiring contract), TL (transfer listed), S with matches left (suspended), L (on loan), A (academy). Hover or keyboard focus explains each: injury type, days out and return date; expiry date; asking price. Listing and expiry badges elsewhere use the same letters.
  - **Injury tags** show days out and the return date at once, on hover or focus, on Squad, Tactics, Dashboard and Live. A first version used the browser's own tooltip (`title`), which showed nothing for T. It's now a rendered tooltip outside table clipping.
- **Cosmetic skill tags** (SPEC §11 table, design doc #62):
  - twelve two-letter tags after player names on Squad and Tactics, in the ratings card and on the profile: Pc, St, Ae, Dr, Fi, Pa, Sp, Cr, Bw, En, Rf, Ha;
  - T approved the list, adding Sp and replacing Dp with a weighted Pa;
  - worked out from the displayed ratings on each page (rounded the same way everywhere), never saved and never read by the engine; every tag a player qualifies for shows; How to play lists them.
- **Pitch views** (SPEC §11, design doc #61; replaces "No pitch view"):
  - **Tactics and the pre-match line-up** show the starting XI on a pitch (attacking upwards), with names, slot OVR and condition; the table stays below. The pitch and the table share selection, drag and drop, keyboard swaps, Auto, Reset and Save. Other clubs are read-only. Long names show a first initial; the full name is in the tooltip and the table.
  - **The player profile** maps OVR at all ten position groups on 14 spots (centre, left, right). Colours: best, within 3, 4–8 below, 9+ below. It compares OVRs; it isn't a familiarity system (Tactics adds foot fit).
  - Drawn in SVG/CSS from the formation config (wing-backs in midfield for a back three, in defence for a back five). No engine, rules, ratings or saves changed.
- **Player profile layout:** bio and the position map top left; grouped ratings (with changes since last season) and the radar top right; compact contract and condition; an expandable mood breakdown. The OVR/POT line chart is replaced by a **ratings-history table**: every development update with date, age, OVR, POT and all 22 ratings (design doc #63).
- **Results and tables:**
  - **Whole result rows:** completed matches on the Dashboard, Game Log and Schedule are green, yellow or red for a win, draw or loss.
    - The Dashboard and Schedule take the user's club's view; the Game Log the viewed club's.
    - Other clubs' Schedule fixtures stay neutral, and the user's upcoming fixtures keep their blue.
    - Draw badges are yellow everywhere.
    - The colour comes from a typed result in the match view (`homeResult`, shoot-outs included), not from the score text.
  - **Tables:** player and team tables have light zebra stripes and hover shading. Selection, zone and result colours take precedence.
- **Transfer Market search:** name, nationality (either nationality), league, position, OVR range, age range, minimum POT, maximum value, maximum yearly wage and final-year contracts, applied before the best 100 are picked.
- **Clickable players in messages:**
  - Inbox subjects and bodies, and the Dashboard's inbox preview, link the players they name.
  - New transfer, bid, loan, contract and academy messages save the player ids with the names of the day (new optional field `inbox.players`, no migration).
  - Older transfer, contract and injury messages get links when a full name matches exactly one current player; ambiguous names stay plain.
- **Browser checks:**
  - **New:** `injury` (19 checks), `tables` (14), `formation` (21), `messages` (5).
  - **Updated for the new markup:** `m5` (the ratings-history table replaces the chart test), `m6` (adds the ratings card, flags and skill tags: 81 checks) and `career` (finds expiring contracts by their tag).
- **Gates at the end of the round** (run in T's session, 2026-10-21):
  - **Pass:**
    - lint, 280 unit tests in 47 files, the build and the bundle check;
    - `pnpm calibrate --check` (0.137 reds and 0.900 ms per match) and `pnpm generate --check`;
    - browser checks m5, m6, sweep, career, tabs, layout, injury, tables, formation and messages;
    - perf: worst season 4.7 s, 18.7 s at ×4; 41.4 MB after ten seasons; slowest page 200 ms.
  - **Fails: `pnpm calibrate --world --check`, the peak-age gate.** In the last season, 27–29-year-olds average 64.03 OVR against 64.92 for 24–26 (3 worlds × 20 seasons). At `4002fba` the same command passes, 64.80 against 64.56. Every other world gate passes. No coefficients or targets were changed to hide it.
    - **It is noise at the gate's edge, not a regression** (checked in this session, 3 worlds × 20 seasons each). 27–29-year-olds against the best younger band:

      | Version | Default seed (CI) | Seed `peak-a` | Seed `peak-b` |
      | --- | --- | --- | --- |
      | Before the feedback round (`4002fba`) | 64.8 v 64.6, passes | 64.6 v 65.3, **fails** | 64.5 v 64.5, passes (but **fails** the POT-exceed gate: 13.7% against a 14% minimum) |
      | After it | 64.0 v 64.9, **fails** | 64.7 v 64.4, passes | 64.7 v 64.4, passes |

    - Over the six runs the gap goes from −0.9 to +0.3 and averages about 0: in these worlds 24–26 and 27–29 peak level. M4 already noted that peak age sits at its edge. Any engine change reshuffles the random path; this time CI's seed landed on the failing side.
  - **Fails: `edges`, 21/22.** Its extra-time check needs a watched cup tie that is level after 90 minutes. With the new random path, the two or three cup ties it watched were all decided in normal time. Extra time itself is covered by the engine tests.
- **Settled at the check-in** (T, 2026-10-21):
  - **The peak-age gate allows 1 OVR** (design doc #64): 27–29-year-olds must be rated at least as high as the younger bands, less 1. The allowance lives in `calibration_targets.json` (`peakAge.tolerance`).
  - **`edges` uses seed "edges-6"** (test only). Seeds "edges" and "edges-2" to "edges-5" watched one or two cup ties, none level after 90 minutes. With "edges-6" the tie goes to extra time and then **penalties**, so the browser checks now reach a live penalty shootout too.
  - Six files had a new import above their header comment; moved below it (cosmetic).
  - Firefox stays pending; it doesn't block the release.
- **Gates after the check-in, all pass, run one at a time** (2026-10-21):
  - `pnpm lint`; `pnpm test` (280 tests in 47 files); `pnpm build` and the bundle check;
  - `pnpm calibrate --check` (0.137 reds a match), `pnpm generate --check`;
  - `pnpm calibrate --world --check`: peak age 64.0 against 64.9, inside the 1-OVR allowance by 0.1;
  - all 354 browser checks: m5 91, m6 81, sweep 43, career 11, edges 22, tabs 20, layout 18, perf 9, injury 19, tables 14, formation 21, messages 5;
  - perf: the worst season 4.9 s (19.5 s at ×4), 40.6 MB after ten seasons, slowest page 213 ms.
- **Release** (2026-10-21):
  - **PR #8:** CI passed ("Lint, test, build" 6 min 8 s; "Generation and calibration" 4 min 34 s), and so did the Cloudflare preview. `m5` passed 91/91 against the preview, which served the same bundle as the local build.
  - **Merged** as `02ac0de`. Tagged **v0.1.0**, with a GitHub release carrying the changelog's 0.1.0 text.
  - **Production** served the new bundle about 12 minutes after the merge.
  - **Checks against production:** m5 91, m6 81, edges 22, tabs 20, layout 18, injury 19, tables 14, formation 21, messages 5. That's 291 checks, all passing.
    - `m6`'s flag check first failed there: over the network the flag hadn't loaded when it was read. The check now waits for the image (up to 10 s); the flags themselves load fine.
- **Open for T:**
  - **Academy incentive.** Academy players of 16+ may play without counting toward the 25 (SPEC §7.1), so promoting one mainly allows loans and sales. The options put to T: a pro contract to play, a limited number of free appearances, or the current rule. Nothing changed.
  - **More status tags:** "tired" and "open bid" were proposed and left for T.
- **Next:** at T's go after the check-in, Claude pushes `m7-release`, opens the PR, watches CI and the Cloudflare preview, merges with T's OK, tags v0.1.0, creates the GitHub release and runs the production checks (T, 2026-10-21; an earlier note in the feedback session had T running these himself).

### M7 summary
- **Built:**
  - **Developer pages removed;** version 0.1.0 shown on Manage Leagues and Settings.
  - **Performance pass** (`perf`, ten seasons):
    - a season takes 16–18 s on the "4× slower laptop" (budget 60 s);
    - the save is 39–51 MB after ten seasons (budget 100 MB);
    - the heaviest pages load in at most 215 ms;
    - retention and pruning work as the spec says.
    - CI now runs in two parallel jobs.
  - **Edge states** (`edges`): empty pages say why. Promotion, relegation, an FFP ban and negative cash show on every page that mentions them. Pruned players keep their names in old box scores.
  - **Robustness** (`tabs`):
    - every change and every Play reaches every tab;
    - one league is open at a time;
    - a reload never leaves a half-saved game;
    - the longest names fit;
    - errors read in plain words, and a page crash shows a message.
  - **Laptop layout** (`layout`): every page fits at 1280×720, 1366×768, 1366×768 at 125% and 960 px. The top bar stays one row, the Menu button is in it, and the Dashboard's match cards no longer overlap.
  - **Release:** the How to play page, `CHANGELOG.md`, the README.
  - **T's local-test feedback** (chunk 6, part 2):
    - suspensions for sendings-off, and fewer red cards;
    - ratings cards, flags, rating changes, and status and skill tags on Squad and Tactics;
    - pitch views on Tactics and the profile; a ratings-history table on the profile;
    - whole result rows in colour; more Transfer Market filters; clickable players in messages.
    - Four new browser checks: `injury`, `tables`, `formation`, `messages`.
- **Decisions** (T, Deviations table, design doc #57–#64):
  - "mid-range laptop" = the measured season time × 4;
  - T tests Firefox by hand;
  - the release format: the version in the app, a changelog, a GitHub release;
  - one league open at a time;
  - How to play as a page in the game;
  - suspensions for sendings-off;
  - pitch views;
  - cosmetic skill tags;
  - the ratings-history table and the other player UI changes from T's test;
  - the world peak-age gate allows 1 OVR.
- **Judgment calls:**
  - one save per Play: a reload in the middle of a Play loses that stretch, never half of it;
  - saving tactics doesn't refresh other tabs, so the Tactics editor keeps its "Saved" note;
  - layout sizes are what the browser shows of each screen, plus Windows' 125% scaling.
- **Acceptance** (MILESTONES M7):
  - the performance budget is met (`perf`, also after the feedback round);
  - no known crashers (two bug bashes, twelve browser checks);
  - deployed to Cloudflare Pages as v0.1: done on 2026-10-21 (PR #8, tag v0.1.0, production checks pass).
- **Not green at the end of the feedback round,** then settled at the check-in: the world calibration's peak-age gate, and `edges`' extra-time coverage (chunk 6, part 2).
- **Known edges, for later:**
  - the "incomplete save" message wasn't triggered in a test;
  - phones aren't supported (desktop first, down to about 960 px);
  - no bans for a build-up of yellow cards.

## After v0.1 notes (from 2026-10-21)
**Plan** (approved by T): 4 chunks of about an hour, on `after-v0.1`, nothing pushed before T's local test.
1. Match ratings: the 6.9 scale and keepers on goals prevented.
2. Fit highlights when dragging or picking a player in a line-up.
3. The full tactics board in a paused live match, game side: the board's data, a preview of changes, free position moves (including into a sent-off player's empty slot).
4. The board on screen, with a "rating so far" column; the live browser checks updated.

### Chunk 1: match ratings (2026-10-21)
- **Built:**
  - ratings centred on 6.9, about 20% wider, with a soft top: above 8.4 they climb at half speed;
  - tackles and interceptions 0.13 each (was 0.07 before the stretch), key passes 0.22 (was 0.12);
  - keepers: 0.5 per goal prevented (post-shot xG faced − goals conceded) and −0.1 per goal conceded; no clean-sheet or per-save bonus (saves count through goals prevented); a soft bottom below 5 at half speed;
  - the engine records `psxgFaced` for keepers: each on-target shot adds xg / (xg + (1 − xg) × saved share), the chance an average keeper concedes it. The penalty saved share (0.65) moved into the coefficients;
  - development (`performancePerPoint` 0.15 → 0.12) and market value (form 0.15 → 0.12 a point, within ±1.25) read ratings against the new centre. Half-season averages spread 1.24× wider, so the effect is the same (performanceAdj spread 0.0307 v 0.0310 before);
  - league DB v3: opening an older save converts its box-score ratings, season totals and half-season tallies once (new = 6.9 + 1.12 × (old − 6.6), the best straight-line fit, r = 0.975), in the upgrade transaction; keepers' missing post-shot xG is filled in as neutral.
- **Where it landed** (neutral sample, 4,500 matches; full games of 80+ minutes):

  | | Before | Now | T's target |
  | --- | --- | --- | --- |
  | Average, full games / everyone who played | 6.62 / 6.55 | 6.94 / 6.83 | 6.8–7.0 |
  | One goal / two / hat-trick | 7.6 / 8.7 / 9.8 | 8.1 / 8.9 / 9.6 | higher for standouts |
  | Midfielder, no goal or assist, top 1% | 7.3 | 8.0 | about 8 |
  | A 10 | every 87 matches | every 125 matches | rare |
  | Keeper: clean sheet (median, 10th–90th) | 7.5 | 7.6 (7.3–8.0) | usually 7.3–7.5 |
  | Keeper: 4+ conceded, not at fault | — | 6.3 | about 6 |
  | Keeper: clear mistakes (≥ 1.5 / ≥ 2 goals worse than expected) | — | 5.4 / 5.1, never below 4.5 | 4.5–5 |
  | Keeper v outfield spread (sd) | — | 0.72 v 0.84 | keepers steadier |
  | Sent off | 5.2 | 5.1 | lower for terrible games |
  | Best season averages | 7.4 | 7.6–7.8 by position | 7.8–7.9 |

- **The keeper trade-off:** with keepers averaging 6.9 like everyone, a clean sheet sat about 0.7 above and conceding four about 1.2 below. Pulling clean sheets down to 7.4 would have pushed "four conceded, not at fault" up toward 6.6, so both sat a little high (7.6 and 6.3). **T chose a lower keeper centre, 6.8** (follow-up commit): keepers now average 6.79, a clean sheet 7.5 (10th–90th 7.2–7.9), big-save clean sheets 7.9, four conceded but blameless 6.2, clear mistakes 5.0–5.3. Development, market value and the old-save conversion use each position's centre, so keepers' growth is unchanged.
- **Checks:** lint; 291 unit tests (new: `ratings.test.ts`, the v3 upgrade, keepers' post-shot xG and the 6.9 average in the engine); `pnpm build`; `pnpm generate --check`; `pnpm calibrate --check` (`avgMatchRating` 6.83 in 6.8–7.0); `pnpm calibrate --world --check`, all pass; browser checks `edges`, `m6`, `sweep`. A throwaway real-browser check made a save with the v0.1.0 build, opened it with the new one, and found all 3,024 ratings, 1,447 season totals and 1,128 tallies converted exactly, then played on.
- **World calibration, before → after** (CI seed): young regulars +4.16 → +4.21 OVR a year; 33+ −5.44 → −5.45; wonderkids 0.62 → 0.54 a league-season; peak-age gap −0.9 → −0.4 (allowance 1). On a second seed wonderkids went 0.66 → 0.68, so the dip is noise. With the keeper centre at 6.8: +4.20, −5.45, wonderkids 0.68, peak-age gap −0.2; all gates pass.
- **Known edges, for later:**
  - the rating average sits near its floor with CI's seed: 6.83 (floor 6.8). Short cameos average below 6.9 (they're pulled only partly toward it), which keeps "everyone who played" under the full-game average. Wonderkids went 0.62 → 0.54 → 0.68 a league-season across the two commits (floor 0.5): noise;
  - the top bar shows a Play's end date a moment before the save is written ("Playing…" still shows); leaving the page then loses that Play, as designed. Found while testing, unchanged.

### Chunk 2: fit highlights in line-ups (2026-10-21)
- **Built:**
  - the line-up view (`TacticsView`) sends each player's OVR in every slot of the formation shown (wrong foot counted) and his best OVR, and each slot's position;
  - `src/ui/components/lineupFit.ts`: `slotFit` uses the profile map's bands (`positionFit`), so "natural" here means the same as "comfortable" on the profile; `moveFit` judges a move: into a slot, the mover must suit it; out of a slot, the incoming player must; a swap inside the XI takes the weaker of the two fits; bench and reserve moves are never highlighted;
  - the Line-up editor (Tactics and the pre-match screen) highlights rows and pitch slots while a player is dragged or picked (`data-fit` on each), with a line under the pitch explaining the colours.
- **A rule added while testing:** keepers and outfielders never mix. Weak players' OVRs bunch together (an academy keeper at 40 is within 8 of his outfield OVRs), so by the bands alone 105 keepers would "cover" outfield slots and 27 outfielders the keeper's. The `formation` check caught it.
- **Checks:** lint; 298 unit tests (new: `lineupFit.test.ts`); browser checks `formation` (seven new checks: picking the keeper lights only keepers, an outfielder never a keeper, two strengths only, a dragged spare keeper lights only the keeper's slot, highlights clear), `m6`, `tables`.

### Chunk 3: the live tactics board, game side (2026-10-21)
- **Built:**
  - engine: `MatchChanges.slots` (who plays where after the subs and any formation change; null = an empty slot) applied after subs and re-slotting; free. Only the players on the pitch can be placed, each once; a substitute is rated against the slot he ends up in. Slider values are checked before anything changes;
  - engine: `ratingSoFar`: the rating a player would get if the rest of his match were average for his position, at the current score. Off the pitch, his match is over. At full time it equals his match rating (tested for every player). The per-player stats now come from one helper, `statsAt`, shared with `matchResult` (results unchanged: calibration identical);
  - worker: `getLiveBoard` (a `TacticsView` of the user's side: slots, the substitutes left, no reserves; the engine's team ratings now, energy counted, without the hidden form on the day; each player's energy, booking, injury, minutes, goals, assists and rating so far; subs and windows left; warnings for an empty slot, an outfielder in goal, injuries and players below 50% energy) and `previewLiveChanges` (the same board on a copy of the match);
  - `changeLive` applies changes to a copy and keeps it only if every change is valid, so a refused change leaves the match as it was (before, a bad slider could leave the subs made); rule errors now reach the player in plain words, not as "Something went wrong";
  - `src/common/liveChanges.ts`: turns the board's edited line-up into live changes (subs paired with the slot they take, everyone's final slot, the sliders that moved), and says in plain words when a substitute would fill a sent-off player's place or a player would go off without one.
- **Checks:** lint; 309 unit tests (new: free moves and bad arrangements; T's red-card case, a centre-back on for a midfielder and moved into the empty slot; rating so far equals the match rating at full time; the board at half-time; a preview and a refused change leave the match result byte-for-byte unchanged; the change helper); `pnpm calibrate --check`; browser checks `m6`, `edges`.
- **Next (chunk 4):** the pause screen shows the board (pitch, XI and bench tables, sliders, team ratings with the preview's changes, fit highlights, energy and rating so far) in place of the dropdowns; the live browser checks follow.

### Chunk 4: the live tactics board on screen (2026-10-21)
- **Built:**
  - the pause screen (`Live.tsx` `ChangesPanel`) shows the Line-up editor on the live board: the pitch (energy on each card; "Move a player here" on an empty slot), the XI and the bench with Energy, Min, G, A and Rating (so far) in place of condition and the season's columns, booking and in-match injury badges; no reserves and no Auto. Every edit is turned into live changes (`liveChanges`) and previewed (`previewLiveChanges`); a change the rules refuse reverts, with the reason in plain words. **Make changes** (with the number of substitutions) makes them all at once; **Reset** goes back to the line-up on the pitch; **Resume** drops any not made;
  - the editor gains a live mode without changing Tactics or the pre-match screen: optional Auto, the save button's wording and id, extra buttons; a change the worker refuses now goes back to the last line-up it showed (before, the table and the edit could disagree);
  - fit highlights work on the board; a sent-off player's empty slot lights up only for players already on the pitch;
  - the board refreshes when the match clock moves while it's open (a step that finished after Pause).
- **Checks:** lint; 310 unit tests; every browser check (14): `m6` rewritten for the board (the board's contents, a free swap, a substitution, the formation and sliders, a free half-time substitution), `career` makes its half-time change on the board, and a new `board` check plays T's case: a centre-back sent off (written into the saved match), a substitute refused for his slot, a centre-back on for a midfielder and moved into the empty slot, the match playing on with ten.
- **Known edges, for later:**
  - the pause screen is long at laptop sizes (the board, then the commentary and both teams' cards below); `layout` passes;
  - a substitute's "rating so far" starts a little below 6.9 (about 6.7 for a 10-minute cameo), because a short cameo's final rating does too: cameos are pulled only partly toward the average (SPEC §8.7).

## UI improvements (from 2026-10-23)
### Ratings layout (2026-10-23)
- **T's decisions** (design doc #68): FM-style grouping (Technical, Mental, Physical, with Set pieces and Goalkeeping as small blocks); the slot's position drives the highlights on Tactics and the live board, the listed position elsewhere; full names; the profile gets the same treatment.
- **Built:**
  - `src/ui/ratingsLayout.ts`: the three columns (`RATING_COLUMNS`) over the config's display groups, short names ("Dribbling", "Reflexes"; the full name on hover), and each rating's importance for a position from the OVR weights (3 = key, 2 = useful, 1 and 0 plain);
  - `RatingsGrid` (`PlayerDetails.tsx`), shared by the ratings card and the profile: a table per group, highlighted rows (blue tint and a bar on the left, so they don't fight the red-to-green numbers), a legend ("Highlighted for DM (this slot): key, useful"), and the profile's change column. Screen readers hear "(key for CB)";
  - the card is 480 px wide (was 410) and puts OVR/POT beside the "Ratings" heading, so it stays 469 px tall and fits the 125%-scaled laptop window (506 px) without scrolling; two columns below about 450 px;
  - `ratings_positions.json`: display groups relabelled (Attacking, Passing, Defending → Technical, except `ant` → Mental; Specialist → Set pieces). Display only: the engine reads the age-curve groups, which already had this split;
  - `SquadPlayerView.position` and `PlayerView.position` are typed `Position` (they always were position codes).
- **Checks:** lint; 314 unit tests (new: `ratingsLayout.test.ts`); browser checks `m6` (new: the keeper's card groups and highlights for GK), `m5` (new: the profile's groups and legend), `layout`, `sweep`. By hand in a real browser: a full-back swapped into the right-wing slot shows "Highlighted for W (this slot)" with the winger's key ratings; no label wraps at 1263–1349 px on the profile or in the card.
- **Known edge:** at phone width (390 px) the top bar overflows the page; it did before this change (phones aren't a target).

### Man of the match (2026-10-23)
- **T's request:** the highest match rating gets man of the match, recorded so that later awards can use it.
- **Built:**
  - engine: `manOfTheMatch` (`engine/ratings.ts`) picks the highest rating; ties (ratings have one decimal) go to the winning side (after extra time and penalties), then more goals + assists, more minutes, the lower pid. `matchResult` sets `MatchResult.motm` (a pid), so simulated and watched matches name him the same way; the RNG is untouched, so results and calibration don't move;
  - saved: on the match record, and as a count on the season stat row (`PlayerStatsRow.motm`, per club and competition, like clean sheets). Future awards can read the season counts, or the current and last season's match records (all kept);
  - league DB v4 (`upgradeToV4`): names the man of the match in every saved match record of an older save and counts the awards on its stat rows. A v2 save goes through v3 then v4 in the same upgrade. Other clubs' records older than two seasons were pruned before, so their counts for those seasons stay short; the user's clubs' are complete;
  - shown: a gold ★ and a "Man of the match: name (8.7)" line in the box score; the full-time banner of a watched match; a MotM column on Player Stats and in the profile's career table; a ninth League Leaders category.
- **Checks:** lint; 317 unit tests (new: the rule and its tie-breaks, `matchResult` names the top-rated player, a whole season counts exactly one award per match in every competition, the v4 upgrade with a tie, run twice); browser checks `m5` (nine League Leaders categories), `m6`, `layout` (new: full time and the box score name the same player, starred, with the top rating). By hand in a real browser: a save made with the v0.2.0 build (a whole season, 1,305 matches) opened with this build: league DB v4, every match names its top-rated player, the 2,607 stat rows count 1,305 awards in all, and the box score and League Leaders show them.

### Inbox on the Dashboard (2026-10-25)
- **T's request:** no separate Inbox page, the inbox in full on the Dashboard's right-hand side; answer a bid from its message.
- **Built:**
  - `InboxPanel` (`src/ui/components/`), from the old Inbox page: every message newest first in a list that scrolls on its own (40 rem), a kind filter (a dropdown, to fit the column), Mark all read, unread in bold. It replaces the five-message preview under the board and the alerts;
  - bid messages: open, they show Accept / Reject (the same `respondToOffer` as Transfer Market › Incoming offers, errors shown in the message) and an "All bids" link to that tab; in the list they carry an "Open bid" badge; once answered or lapsed, "Bid completed / rejected / expired";
  - the link: an AI bid's message now saves the bidding club (`InboxMessage.bidFrom`). The Dashboard view finds the offer for the message's player, date and club. Older saves' bid messages ("Bid for …", no club) match when exactly one offer fits. Bids are kept for their season only, so earlier seasons' bid messages show no buttons;
  - the sidebar's unread count moves to Dashboard; `/l/:lid/inbox` replaces itself with the Dashboard; the Alerts' "bids for your players" links to Incoming offers; `getInbox` is gone (the Dashboard view carries the inbox); How to play updated.
- **Checks:** lint; 318 unit tests (new: bid messages name their club; the Dashboard links messages to offers, including two clubs' same-day bids, an older save's message, an ambiguous one, and the status after an answer); browser checks `messages`, `m5`, `tabs`, `edges`, `sweep` (updated for the Dashboard inbox) and `career` (now answers its bids from the inbox).

### Yellow-card bans (2026-10-25)
- **T's request:** a one-match suspension after five yellow cards.
- **Judgment calls** (closest to the real game; T can change them): every fifth yellow (5th, 10th, 15th…) is one match, not escalating; yellows of all domestic competitions count together, as bans are served across them; the count starts again each season and follows the player through transfers; the yellow before a second-yellow dismissal doesn't count (that sending-off is already a one-match ban).
- **Built:** `applyDiscipline` (`season/discipline.ts`) keeps the season's count on the player (`Player.yellows`, optional; older saves count from their next yellow) and bans on every `YELLOWS_PER_BAN` (5). Simulated and watched matches share it, and the AI already leaves suspended players out.
- **What it does:** over one simulated season (two seeds), about 10 yellow-card bans per club (610–677 in all); 470–500 players serve at least one. The engine gives a few players 25–26 yellows a season (five bans); real leagues top out near 15. That spread was already there, now it shows.
- **Checks:** lint; 321 unit tests (new: bans at the 5th and 10th yellow, served from the next match, a new season starts at zero, a two-yellow dismissal's yellow isn't counted). `pnpm calibrate --check` and `--world --check` pass (average rating 6.83, floor 6.8; peak age −0.6, allowed −1). The season-loop test of retired-player pruning picked a retiree with an award (kept by the rule) once the seasons played differently; it now picks one the rule doesn't keep.

### Pre-match: unavailable players shown (2026-10-25)
- **T's request:** show injured players in the pre-match line-up, in Not in the squad.
- **Built:** the pre-match view (`getLiveLineup`, `setLiveLineup`) returns `unavailable`: the club's players who can't play in this match (injured, suspended, on loan from the opponent). The editor lists them after the pickable reserves, greyed out, with their I or S tags, and without drag, click or keyboard handlers. The note above the editor says so.
- **Checks:** unit test (an injured and a suspended player are listed, not pickable, and a line-up naming one is cleaned); new browser check `prematch` (both listed with I and S2, after the reserves, greyed out, nowhere else, not draggable or pickable); `m6`, whose two pre-match moves now pick a player and click the slot: with the greyed-out rows the page grew, and a drag's target slot ended up under the top bar (dragging stays checked on Tactics); `formation`, `board`, `injury`.

### Narrative, chunk 1: live commentary (2026-10-25)
- **T's request:** more narrative in the live game and on the player profile. Agreed plan in five chunks: (1) live commentary, (2) a pre-match card (both sides' last five results, the last meeting, a derby flag) and the profile's form, (3) honours (a section, badges in the Career table, a new Top assists award), (4) birthplaces (GeoNames towns, population-weighted; academy players often from the club's city), (5) injury history. Dropped on the way: context lines under goals, half- and full-time summaries, a profile summary paragraph, standing at the club, a career timeline.
- **Built:** shot events carry an optional `story` (`common/match.ts`): the creator's wing (crosses, dribbles), the set piece and its taker, how the move began (long ball, ball won in the final third), a follow-up (rebound or second ball), and the keeper or defender who stopped it. `possession.ts` fills it from what it already decides, with no new random draws: match calibration output is identical (timing aside). The UI (`components/commentary.ts`) writes each shot, goal, card and penalty from it, picking among several phrasings by a hash of the event, so a reload reads the same. Goal lines carry the score. The Key moments / Full commentary switch sits above the feed (full by default, remembered in `localStorage`); key moments are goals, cards, subs, injuries, penalties, period markers and chances of 0.30 xG or more.
- **Fixed on the way:** every feed line showed its minute twice (the minute column and again in the text); and the column used the clock alone, so first-half added time read 46' rather than 45+1'. Each line now has one minute label, read in its period.
- **What it reads like** (one simulated match): "Won back high up the pitch. Jon Bishop (Home) threads a pass through to Andrew Beresford, but it drifts past the post. A big chance gone. · xG 0.47"; "GOAL! Ian King (Away), 1–1. Luiz Henrique Mendes swings in the corner and Ian King rises highest. It flies into the net!" Over 40 matches: a long ball starts 3.5% of shots, the ball won high 12%, rebounds and second balls 4%; 18% name a wing.
- **Checks:** lint; 329 unit tests (new: the engine's story is right for saves, blocks, set pieces and wings; the commentary's wording, determinism, variety, old feeds without a story, key moments); `pnpm calibrate --check` and `--world --check` pass; new browser check `commentary` (switch starts on full, remembered after a reload mid-match, one minute label per line, shots name the creator and how they ended, goal lines carry the score, Key moments keeps goals and subs and only big chances); `m6`, `layout`.

### Narrative, chunk 2: match preview and form (2026-10-25)
- **Built:** `getMatchPreview(lid, fid)` (`views/matches.ts`): each club's last five played fixtures before this one this season, in any competition, the latest meeting of the two clubs (searching back season by season until the save's first), and the city when both clubs share it (London, Manchester, Liverpool and Birmingham have more than one club). The Live page shows it as a **Match preview** card above the pre-match line-up: W/D/L badges linking to each box score (the tooltip gives the score, competition and date), the last meeting's score and date, and a red "<city> derby" badge. The profile's **Form** card (`PlayerView.form`, `views/players.ts`) lists his last five matches this season, newest first, from the fixtures of the clubs he appeared for and his line in each match record. A Game Log row and a form entry now share one type (`ClubMatchView`, `clubMatch()`).
- **Judgment calls:** "last five" spans all competitions, as on the Game Log; a two-legged tie's second leg counts as the tie's result, as everywhere else (`resultFor`).
- **T's note on chunk 2 (2026-10-25):** early in a season, show fewer than five rather than topping up from last season. Both the preview and the Form card count this season only (first built with a top-up from last season); a player without a match this season shows "No matches this season."
- **Checks:** lint; 330 unit tests (new: both clubs' last five, oldest first and before the match; the last meeting of a return fixture; no meeting; a derby and a plain match; a regular's last five, newest first, with the rating, minutes and star from each box score; none for an academy player); new browser check `preview` (no games and no meeting before the first match; after seven matches five linked badges per club, the last meeting, a badge opening its box score, a regular's Form card with five rated rows); `prematch`, `m6`, `sweep`.

### Narrative, chunk 3: honours and Top assists (2026-10-25)
- **Built:** `seasonAwards` (`season/offseason.ts`) gives a **Top assists** award per league after the Golden Boot, with its tie-break (fewer minutes, then pid); seasons that ended before it existed have none. History shows it in a Top assists column with the tally (`HistoryView` `topAssists`). The profile's honours (`honoursOf`, `views/players.ts`) come from the award rows (`allAwards`, now shared in `views/common.ts`): his Player of the Year, Golden Boot, Top assists and Team of the Season awards, and his clubs' `champions`, `cupWinner` and `promoted` rows where his Career has a row for that season, club and competition with at least one appearance. An **Honours** card (`components/Honours.tsx`) lists each kind once with its count and seasons; the **Career** table shows the same badges on the matching row (club honours gold, personal awards blue; the tooltip names the competition and season).
- **Judgment calls:** a promotion is shown in the league the club went up from; play-off winners already get a `promoted` row, so their separate `playoffWinner` row isn't shown twice; relegations aren't honours. Top assists winners now also count as award winners for pruning (retired players with an award are kept), so a few more retirees stay in the save.
- **Checks:** lint; 332 unit tests (new: Top assists goes to the most assists, ties to fewer minutes; a player's honours: his awards, his club's titles only where he played in that competition, not another club's, not a cup run he sat out, promotions, no relegations or play-off rows, order by season then kind); `pnpm calibrate --check` and `--world --check` pass; new browser check `honours` (one season: History's Top assists column in all three leagues; the first league's provider has "1× Top assists" on his card and the badge on that league's row; a champion's card and row show Champion); `sweep`, `career`.

### Narrative, chunk 4: birthplaces (2026-10-25)
- **Plan change (T):** the agreed plan used GeoNames towns weighted by population. While building it, it turned out every player already has a birthplace, generated since M1 from Wikidata: where real footballers of his nationality were born, up to 40 towns per nationality, weighted by how many (England: London, Liverpool, Manchester, Birmingham, Sheffield…). It was never shown. T chose to show that instead (simpler, no new data file); the GeoNames file was not added.
- **Built:** the bio lists a **Birthplace** fact beside Age, Nationality and Foot (`PlayerView.birthplace`; first built inside the Age line, moved to its own fact at T's request). Local lads (`generate/birthplace.ts`): a club's academy players of the club's own country are born in the club's city at `LOCAL_SHARE` (0.5), by a coin on each player's own stream (`${seed}/birthplace/${pid}`), so nothing else in the world shifts (`pnpm generate --check` and the calibrations are unchanged). New worlds apply it to the academies at creation, the yearly youth intake to each new youngster. **League DB v5** applies it to an older save's academy players and the academy graduates (by their promotion record), giving the same as a new world from that seed would; players an academy released before the upgrade keep the name data's town.
- **Checks:** lint; 335 unit tests (new: the coin gives about half, the same answer every time, never a foreigner; a new world's home-country academy players about half local, everyone else from the name data; the youth intake about half local; the v5 upgrade matches the rule for academy players and graduates and leaves foreigners and others alone); `pnpm generate --check`, `pnpm calibrate --world --check`; browser checks `preview` (the bio says "born … in <town>"), `sweep`, `career`.

### Narrative, chunk 5: injury history (2026-10-25)
- **Built:** both places a player gets hurt record it: `applyMatch` (now given the fixture, for its id and the opponent) and `trainingInjuries`, through one `injure()` (`season/squads.ts`) that sets `Player.injury` and appends an `InjuryRecord` to `Player.injuries` (optional; absent until a first injury). New leagues note `GameMeta.injuriesSince` (the season start); **league DB v6** sets it to an older save's current date, so its profiles say since when. The profile's **Injury history** card (after Transfer history) lists them newest first: date, injury, time out ("4 days", "3 weeks"), and "In a match against <club>" (linking to the box score) or "In training"; empty, it says "No injuries since <date>."
- **What it costs:** nothing random changes (calibrations pass unchanged). The `perf` check's ten seasons: 4.3–5.0 s each here (×4 ≈ 17–20 s, budget 60 s), save 50.4 MB after ten (budget 100 MB; 51 MB in M7).
- **Judgment calls:** the time out is what was expected when it happened (the injury's length); every player is tracked, so a transfer target's record is visible. That hints at the hidden Injury Prone trait through facts only, as agreed; the trait itself stays hidden.
- **Checks:** lint; 336 unit tests (new: a match injury records the fixture and the opponent from his side; training injuries all land in the histories, with no fixture; a profile's history newest first, since the league's start, matching its fixtures; the v6 upgrade dates an older save's history); `pnpm calibrate --check` and `--world --check`; browser checks `preview` (an injured player's history starts with his current injury, each row with its time out and where, and says since when) and `perf`.

### The user's tactics, chunk 1: Tactics page and simulated matches (2026-10-25)
- **T's request:** the Tactics page is the main tactic, set and changed only by T. Simulated matches may switch players, but that never changes the saved tactic. Watched matches show the saved tactic until T changes it, injured and suspended players included, and can't kick off with one of them in the squad (chunk 2). T chose today's rotation (rests more players, so simulating isn't a disadvantage) and the AI's sliders.
- **What was happening:** nothing ever overwrote a saved line-up, but until T pressed Save the page showed the AI's pick for today, worked out afresh on every visit; and a suspended player showed as an empty slot. Simulated matches ignored the saved XI and bench (only the formation was used).
- **Built:** `withAutoLineup` (`club/tactics.ts`) saves the AI's pick for today as the club's line-up: at `createLeague`, at `acceptJobOffer`, and in **league DB v7** for an older save without one (left without if the pick can't be made). `currentSetup` keeps suspended players; the Tactics page and Save accept them, with warnings ("… is suspended for the next 2 matches.", "1 suspended player on the bench."). `pickMatchday` takes the user's line-up (`MatchdayContext.preferred`): each of his starters counts as one point better in his saved slot than anyone else could be there, and his XI are the regulars, so a fresh XI starts as saved and the same tiredness and rest penalties then apply; his bench comes first, then area minimums and the rest; academy players he named join the pool when fit. `squadPlay` now takes the user's club and passes his line-up for it only. The pre-match Auto button gives the AI's simulated-match pick (from his line-up; in another formation, from scratch). The Tactics note, the Save message and How to Play say so.
- **Judgment call, to show T:** a starter T picked over a better player counts as only just better than him, so in matches that matter less (an early cup round, a much weaker opponent: rest of 2.8–4.9 points) he is the first to be rested, as an AI regular with an equally good backup would be. In the browser check's first match (against a much weaker side), T's substitute-turned-starter sat out for the better player. The alternative is a bigger margin for T's picks (rested only when tired).
- **Unchanged:** AI clubs pick exactly as before; `pnpm calibrate --world --check` prints the same numbers as on main (timing aside), and new worlds are identical (`pnpm generate --check`).
- **Checks:** lint; 342 unit tests (new: his fresh XI and bench start as saved, weaker picks too; an injured and a suspended starter are replaced for that match only; his tired regulars rest more in small games; his academy pick plays; only the user's club gets his line-up; a new league and a new job save the AI's pick; a season of simulated matches leaves his tactics as they were; v7 saves the pick in an older save and keeps one he saved; suspended players stay in the saved line-up with warnings); `pnpm calibrate --check` and `--world --check`; new browser check `tactics` (a new league's tactics already saved; Save says every match starts from them; the first simulated match starts from his XI; after four simulated matches the page shows his saved XI); `m6` (no "No line-up saved yet"), `prematch`, `injury`, `formation`.

### The user's tactics, chunk 2: watched matches (2026-10-25)
- **T's request:** a watched match shows the saved tactics until T changes them, injured and suspended players included, and can't start with one of them in the line-up. No "Replace unavailable players" button: Auto does that.
- **Built:** `watchNextMatch` starts from the saved tactics as they are (`currentSetup`). A line-up that can't start the match (`kickOffProblems`, `league/live.ts`: an empty slot, or a player in the XI or on the bench who is injured, suspended or on loan from the opponent) is kept as the live row's `draft`, saved with the match, while the engine holds a playable stand-in. `getLiveLineup` shows the draft, with those players in their slots and `cantStart` saying who and why; `setLiveLineup` keeps a line-up that still can't start as the draft and restarts the match from one that can. Players who can't play may stay or move within the line-up but can't be brought in from Not in the squad (only those outside the line-up are listed there). `stepLive` refuses to kick off from a draft. A line-up that can start is used as saved: no empty-slot filling, no bench top-up. On the Live page Kick off is disabled with a warning naming them ("Your line-up can't kick off yet. … Swap them out, or press Auto for the AI's pick."); the editor reports each view (`LineupEditor` `onView`). Auto gives the AI's simulated-match pick; My saved line-up goes back to the tactics as saved.
- **Judgment calls:** the bench counts too (agreed with T), and so does an empty slot (a player who left the club): both would otherwise be fixed silently, which is what T didn't want. In the `career` check's playthrough kick-off was held twice in two seasons: "2 slots are empty" after the summer departures, and an injured centre-back.
- **Checks:** lint; 342 unit tests (rewritten: the saved tactics shown as they are, the reasons in slot order, kick-off refused, a player outside the line-up can't be brought in, one in it can be benched and is still a blocker, Auto clears it, My saved line-up brings it back, the draft survives a closed game, the saved tactics never change); browser checks `prematch` (rewritten: the injured and suspended starters in their slots with I and S2, Kick off off with both named, the one outside the line-up greyed under Not in the squad, Auto clears it and Kick off comes on, My saved line-up brings it back, then it kicks off), `m6`, `edges` and `career` (when kick-off is held they swap the player out or press Auto, as a user would), `board`, `commentary`, `preview`, `layout`, `tactics`, `sweep`.

## Super League notes (from 2026-10-27)

### SL0: worlds as data (2026-10-27)
- **Scope (MILESTONES SL0):** each save knows its world, and the worker reads that world's config through the save, never from a global, with Classic unchanged. Nothing visible changes yet; New league still makes Classic saves only.
- **Built:**
  - **Worlds** (`common/config/worlds.ts`): a world is its clubs, its competitions config and its switches (market, youth, money rule, loans, renewals; SPEC §17.1). Only Classic so far, read from today's files (`parseClubs`, `parseCompetitions`, which now take any file and name it in errors). The global `competitionsConfig` and `clubDefinitions` are gone.
  - **Threading:** the league session and the season loop's world (`LoopWorld`) carry the save's `WorldConfig`. Generation (`generateWorld({ config, … })`), the season, the calendar, play-offs, finances, FFP, board, squads, tactics, the AI market and every view take the config explicitly, with no default. `leagueById(config, id)`. Reputation ladders come from the world's clubs.
  - **The save records its world:** meta `world.id`. **League DB v8** sets `classic` on every older save. `openLeague` reads it, `createLeague` and `getClubChoices` take a world id (the New league page passes Classic until SL7).
  - **Tools:** `pnpm generate`, `pnpm season`, `pnpm calendar` and `pnpm calibrate --world` take `--world <id>`, Classic by default (`tools/world-option.ts`; `--world` alone still means the season loop on Classic). The engine calibration and the M1 world checks are Classic's.
  - **Classic fingerprints** (`worker/fingerprint.ts`): hashes recorded from main (50616fc) of a generated world (`tools/generate/world.test.ts`), two harness seasons (`tools/calibrate/world.test.ts`) and a save's first season and summer, every store and meta row (`league/game.test.ts`). Any change to Classic's results fails them and names the part. Re-recorded once, in chunk 4, for the world id now in meta: with it stripped, every hash matched main's.
- **Judgment calls:** cups aren't a switch (a world's competitions config lists its cups, none for the Super League). The world id lives in the meta `world` row, which existed but nothing read. `checks.ts`' M1 thresholds stay Classic's; the Super League gets its own in SL1.
- **Acceptance:** same seed → same Classic world and seasons as main: the fingerprints, plus `pnpm calibrate --world` (3 worlds × 20 seasons) printing exactly main's numbers, timing aside. An older save opens as Classic and plays on (unit test: a v7 save upgrades, opens with Classic's config and plays to its first match).
- **Checks:** lint; 350 unit tests (new: Classic is today's files with its switches, unknown worlds refused, a broken config names its file; the three fingerprints; a new save records its world and opens with it; v8 makes an older save Classic; an older save opens as Classic and plays on); `pnpm build`, `pnpm generate --check` (also with `--world classic`), `pnpm calibrate --check`, `pnpm calibrate --world --check`; all 18 browser checks (416 passes). In the first full browser run `m6` failed once (details not captured); it passed alone, after `m5`, and in a second full run. Watching for it.

### SL1: Super League data and generation (from 2026-10-27)
Plan (about 5 chunks): 1 club values for T's approval; 2 the clubs file, crests and the Classic renames; 3 a Ukrainian names file and nationality mixes by country; 4 the Super League competitions config and world; 5 generation without academies, a placeholder cap, `pnpm generate --world superLeague --check`, creating a Super League save in the worker.

#### Chunks 1–2: clubs, crests, Classic renames (2026-10-27)
- **Approved by T:** the 48 clubs' values, abbreviations, colors and crests (proposal with a crest preview; SPEC §17.3).
- **Built:** `data/clubs_super_league_2026_27.json` (tiers STAR, GOLD, BLUE; `tools/club_generation/build_super_league.py`), 34 new crests. Classic's 14 shared clubs take T's names: name, short name, abbreviation and crest initials (13 changed; Frankfurt Adler already was), code and city kept (`build_clubs.py` gained an optional `code`; it was read-only, unlocked for the approved edit and locked again). One crest module (`crest_art.py`) draws both worlds' crests; a club in both has one crest file, asserted identical. The Vite plugin strips `based_on` from every `data/clubs_*.json`; the real-name list covers both files (87 names).
- **Classic unchanged, names aside:** a generated world, two harness seasons and a save's first season and summer (every store), dumped before and after the renames, are byte for byte the same once the old names are put back. The fingerprints whose parts carry club names were re-recorded (world `clubs`; harness `clubs`, `days`; save `awards`, `clubs`, `transactions`).
- **Judgment calls:** `based_on` for Inter, Napoli, Sevilla, Villarreal and Lille names the club fully ("Inter Milan", "SSC Napoli", "Sevilla FC", "Villarreal CF", "Lille OSC"). The bundle check matches by substring, so "Inter" hit `colorInterpolation` and "Sevilla" the surname "Sevillano", while "Napoli", "Villarreal" and "Lille" would have been skipped as a surname or a city and never checked.
- **Browser checks:** most picked "the first club" of the English top flight (strength, then name). After the renames that is Liverpool Reds instead of Manchester Sky, and the `sweep` playthrough then has the user sacked at the season's end (5th, as Liverpool). The checks now name their club (Manchester Citizens: the same club and game as before; `tabs`' second league Liverpool Reds, as before). `layout` still takes the longest name, now North London Lilywhites, whose first watched match has an unavailable player in the saved line-up: like `edges` and `career`, it now presses Auto when kick-off is held.
- **Checks:** lint; 350 unit tests; `pnpm build` (87 real names checked), `pnpm generate --check`; the data builders reproduce the data exactly on a rerun; all 18 browser checks (17 in a full run, then `layout` after its fix).

#### Chunk 3: nationalities (2026-10-27)
- **Built:** `data/names/UKR.json` (Wikidata, as the others: 200 given names, 400 family names, 40 birthplaces; `build-names.ts` knows Ukraine and reads country mixes too). A club's nationality mix is its league's if the league has one (Classic's three), else its country's (`countryMix` in nationalities.json, for the Super League's tiers; `clubMix`). Free agents and second nationalities draw from the world's mixes added together (`worldMix`: each league's mix in league order, or its clubs' country mixes), passed down through generation (`PlayerSpec.secondMix`). Classic's is its three league mixes in the same order as before: the fingerprints are unchanged.
- **Country mixes** (T approved, 2026-10-27): 13 in `countryMix`. England and Germany are Classic's ENG1 and GER1 mixes, Monaco France's. Only nationalities with a names file, plus Ukraine; more (Greece, Albania, Georgia, Romania, Mali, Algeria…) can be fetched later.

#### Chunk 4: the Super League's competitions; the world registered (2026-10-27)
- **Built:** `data/config/competitions_super_league.json`: tiers STAR, GOLD, BLUE of 16, 30 rounds (15 Aug to 25 Apr), 2 down from Star and Gold, Gold and Blue promoting their winner plus a play-off among 2nd–5th; Star's title play-off among the top 8. No cups, no transfer windows. The play-offs are structured config (`PlayoffFormat`: positions, first-round ties, legs and venue per round, `allSingleLeg`), parsed and checked (every position paired once, rounds halve to one final, 1 or 2 legs); the season runs them from SL2. Classic's six-club play-off keeps the format the season code knows (`playoffFormat: null`). `parseCompetitions` now reads an explicit `CompetitionsFile` type that both files must match. `worlds.superLeague`: the clubs, these competitions and the switches (trades, draft, soft cap, no loans, a re-signing period).
- **First values, to tune later:** TV pools €3.6bn / €1.6bn / €1.0bn (about €225m / €100m / €63m a club, 75% equal), ticket prices and attendance by tier (SL3 sets the money with the soft cap); neutral match-style modifiers (calibrated in SL6). Board targets as SPEC §17.2; they judge the final table, so until SL2 Star's "Win the title" means finishing first.
- **Bundle:** the UI bundle grew to 524 KB (the 34 new crests, inlined), past Vite's 500 KB warning; the worker's to 633 KB (the Super League's data). Both build; see Open issues.

#### Chunk 5: generation; creating a Super League save (2026-10-27)
- **Built:** a world without academies (the youth switch) generates no academy players and no released youth, and its summers skip the youth intake and academy decisions. Opening payrolls come from the cap where the world has one: 85–100% of the club's cap (`capBill`; Classic keeps `revenueBill`, 50–65% of revenue with 70% wages, drawn in the same order). The placeholder cap is €150m for Star (Gold 80%, Blue 65%: about 70% of each tier's lowest revenue), in config until SL3. The world checks (`evaluateWorld`) take the world: club and player counts from its roster rules and academy switch, a new "tiers ordered by strength" check, the payroll against the cap or the squad cost against revenue; the 75+/50–65 quality bands stay Classic's (`WORLD_SHAPE`; the Super League's in SL6). `createLeague({ world: "superLeague" })` makes a save: 48 clubs, 720 league fixtures, no cups.
- **The Super League's generation report:** 1,099 seniors, 120 free agents; every XI within 0.36 of its target; tiers 72.9 > 67.8 > 65.0; payrolls 85.1–99.9% of the cap; 6% of seniors rated 75+, 45% at 65–74.
- **Seen on the way, for SL2–SL5:** a Super League save already plays a season and its summer with Classic's rules: two-legged promotion semi-finals instead of the configured single legs, no Star title play-off. Its squads shrink (1,099 seniors to 923 after the first summer) because nobody can sign anyone without windows or free agency yet.
- **Acceptance (MILESTONES SL1):** 48 clubs, XIs within ±1, tiers in order; `pnpm generate --check` passes for both worlds (`--world superLeague`); a new Classic world generates exactly as before, names aside (fingerprints unchanged since chunk 2); no real names in the bundle (87 checked).
- **Checks:** lint; 360 unit tests (new: the Super League world's shape, play-off formats, single-leg switch and bracket check; each club's country mix; the Super League's generation checks, no academies or past fees, determinism; a Super League save created; no youth intake without academies); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (the same numbers as SL0's run, which were main's); all 18 browser checks in one run (416 passes).

### SL2: Season, play-offs and the first harness (from 2026-10-27)
Plan (4 chunks): 1 one play-off format in config for every play-off, Classic's rewritten in it with identical results; 2 the Super League's season: the champion is Star's play-off winner, the table winner recorded, awards and standings zones per tier; 3 the off-season's lottery, draft and re-signing as stubs, so the year runs end to end; 4 `pnpm calibrate --world superLeague`, first version: tier mobility and yo-yo clubs, the 20-season acceptance run.
**Revised in chunk 4 (T, 2026-10-27):** without academies, a draft or free agency nothing replaces the players who leave, so a Super League world can't last 20 seasons (in season 2 a club can't field 11). T chose to bring the draft's AI core forward from SL4: chunk 4 is the draft; chunk 5 the summer top-up from free agents, the short-of-players rule (SPEC §17.4), the harness report and the 20-season run.

#### Chunk 1: one play-off format (2026-10-27)
- **Built:** a league's `playoff` (config, `PlayoffFormat`): what it decides (promotion or the title) and its rounds, each with its name, legs, venue, the table positions joining it, and how its clubs meet: `reseed` (best-placed against worst-placed), `bracket` (the previous round's ties in twos) or fixed ties. The better-placed club hosts a single match and a tie's second leg. Dates: the rounds take the slots after the last league round, midweek first, then alternating; the final on the weekend nearest `finalNear`. The parser checks the rounds (positions join once, even rounds down to one final, single-match final, unique names). The hardcoded shapes (`PLAYOFF_ROUNDS`, the 4-or-6-club rule) are gone: the season, calendar, squad importance, standings zones, cups page and `pnpm season` read the format. `promotion` keeps the automatic places and the play-off's one promoted club.
- **Classic's play-off rewritten** in it (competitions_mvp.json: eliminators 5–8 reseeded, two-legged semi-finals with 3rd and 4th joining, reseeded, neutral final): the same ties, hosts, dates and fixture order, so identical results (fingerprints unchanged; 20 seasons of `calibrate --world` print main's numbers).
- **The Super League's** play-offs run through it: Star's top 8 in the fixed bracket (1–8, 4–5, 2–7, 3–6; two-legged quarter- and semi-finals, a neutral final on 29 May 2027), Gold's and Blue's 2nd–5th (single-leg semi-finals 2–5 and 3–4, a neutral final on 15 May). A title play-off moves nobody.
- **Checks:** lint; 364 unit tests (new: the formats as parsed, Classic's included; single-leg switch; bad positions and a two-legged final refused; the Super League's brackets, hosts, legs, venues, moves and dates from a played season); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); all 18 browser checks (416 passes).

#### Chunk 2: the Super League's champion, table winner, awards and zones (2026-10-27)
- **Built:** where a play-off decides the title, the champion is its winner (`seasonOutcome.champions`) and the table winner is recorded (`tableWinners`, absent where no play-off decides a title, so Classic's outcome is as before). Awards: the champion gets "champions"; the table winner a new "tableWinner" record (History: "top of the table: …" beside the champion; the club's history: "Top of the Star table"; the final standings' notes); a title play-off gives no "play-off winner" award. Not an honour on player profiles. Per-tier awards (Player of the Year, Golden Boot, Top assists, Team of the Season) already came per league. Standings zones are one shared rule (`tableZone`): where a play-off decides the title, first place is a play-off place, not "Champions"; Star shows 1st–8th as play-offs, Gold and Blue their winner as champions and 2nd–5th as play-offs.
- **For T:** the board judges the final table, in both worlds (Classic's ignores play-offs too). So Star's "Win the title" target is met by finishing first, even if the club then loses the play-off, and a 5th-placed club that wins the title play-off hasn't met it. Options: leave it; rename the target "Finish top of the table"; or have the board count the title play-off at season end.
- **Checks:** lint; 366 unit tests (new: Star's champion is its play-off winner and its table winner is recorded, Classic's outcome has none; the awards; the zones); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); all 18 browser checks (416 passes).

#### Chunk 3: the off-season stages, as stubs (2026-10-27)
- **Built:** new phases `draftLottery`, `draft` and `resigning`, and Play options "Until the draft lottery", "Until the draft", "Until the re-signing period" (Shell labels). After promotion and relegation, the world's switches decide its stages: with a draft (youth switch) the lottery and the draft, with a re-signing period (renewals switch) that period; then "Advance to preseason". Dates are key dates in config (Super League: lottery 5 June, draft 15 June, re-signing from 16 June to 30 June). Each stage only sets the date and phase for now (the draft arrives in SL4, re-signing in SL5). Classic has no stages: its off-season is as before. The 1 May academy reminder only comes where clubs have academies.
- **A Super League year in a save** (new test): the season to Star's final, its play-off winner the champion, 2 up and 2 down between each pair of tiers, then the lottery, the draft, the re-signing period and preseason 2027.
- **Board targets (first values, changed):** playing as Madrid Blancos, the board sacked the user at the season's end. Star gave "Win the title" (finish first) to its 4 strongest clubs and Gold and Blue "Win promotion" (finish first) to 3, so most of them fail every year. Now as Classic's spread: Star title 2, top eight 6, avoid relegation 8; Gold and Blue promotion 2, play-offs 4, mid-table (12th or better) 10. The question for T from chunk 2 (should the board count the title play-off?) stands.
- **Checks:** lint; 368 unit tests (new: a Super League year in a save); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); all 18 browser checks (416 passes).

#### Chunk 4: the draft's AI core (2026-10-27)
- **Built** (`season/draft.ts`, config `draft`): each June a class of 110 prospects aged 17–19 (target OVR 50 + 3 a year over 17, noise 6, between 38 and 66; extra ceiling for the talented, as academy players; nationality from the world's mix). Pick order, the same both rounds (SPEC §17.5): the lottery pool in odds order (Blue 16th–13th, then Gold's and Star's relegated; no draw until SL4), the other clubs in reverse combined standings (Blue, Gold, Star, each from the bottom of its table), the 4 promoted clubs last, Blue's first. The AI picks by 40% OVR and 60% POT, plus 2 per senior the club is short of 3 keepers, 8 defenders, 7 midfielders or 5 forwards in the prospect's area. Rookies: 3-year contracts, wages by pick (€2.5m at 1, €0.8m at 48, €0.4m at 96, interpolated), the pick recorded on the player (`Player.draft`: season, round, pick, club), a "draft" transaction. Undrafted prospects are free agents. A save holds the draft on reaching its stage (the AI picks for the user too until SL4); the harness holds it after promotion and relegation.
- **20 seasons with the draft alone:** squads hold for four seasons and then thin (1,099 seniors at the start; 1,080 after season 3, 976 after 7); in season 8 a club can't field 11. Chunk 5 adds the free-agent top-up and the short-of-players rule.
- **Checks:** lint; 371 unit tests (new: the pick order, rookie wages, a draft's rookies, free agents, contracts, records and determinism; a save holds the draft at its stage); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); all 18 browser checks (416 passes).

#### Chunk 5: free agency, the short-of-players rule, the tier report (2026-10-27)
- **Built:** where players move by trades, a summer free-agency step (`freeAgencyTopUp`, 1 July): AI clubs short of 22 seniors sign free agents, the club with the fewest first, one at a time, the best by OVR plus the draft's need bonus; wages on the club's scale, 2 years (1 from 30). The user's club isn't topped up. Its AI core until SL5 (the user's signings, the cap, the roster deadline). The short-of-players rule (SPEC §17.4): with fewer than 11 who can play (and no academy to fill in), the injured seniors back soonest play; suspended players never do (`pickMatchday`; only where the game used to fail, so Classic's results are unchanged).
- **The tier report** (`pnpm calibrate --world superLeague [--check]`; `tools/calibrate/tiers*.ts`): 3 worlds × 20 seasons in parallel; the acceptance (gated: every season played, exactly the configured places up and down, nobody out of Blue), yo-yo clubs, the rise from Blue's bottom 4 to Star's top 8 (target 4–6 in calibration_targets.json `superLeague`, gated from SL6), tier mobility, the player pool. In CI.
- **First numbers** (seed "calibrate"): the acceptance passes. Yo-yo: 19% of promotions go straight back down within 2 seasons. The rise: average 10.6 seasons, median 11, and 65% of the clocks still running after 20 seasons (target 4–6: SL6 tunes it, once the lottery, the cap and trades exist). 37–43 clubs played in Star per world; of the opening Star 16, 8–10 remain after 10 seasons and 2–4 after 20. Squads 22–27 seniors; 1,222 active players at the start, 1,157–1,178 after 20 seasons. About 35 s for the three worlds.
- **Acceptance (MILESTONES SL2):** a 20-season headless run with 2 up and 2 down between every pair of tiers each season and nobody out of Blue (the report's gate); ENG2's play-offs give identical results to before (chunk 1: fingerprints, 20 seasons of `calibrate --world` print main's numbers).
- **Checks:** lint; 377 unit tests (new: the free-agency top-up, the injured filling a team, the tier measures); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check`; all 18 browser checks (416 passes).

### SL3: Soft cap and finances (from 2026-10-27)
Plan (3 chunks): 1 the cap's rules as tested functions, and the money proposal for T; 2 the rules in the season: the luxury tax and its sharing at season end, the grace season at relegation, FFP off, play-off prize money, no Youth dial spending; 3 over-cap rules for the AI's signings, opening payrolls on the approved cap, the harness reporting cap violations and tax.

#### Chunk 1: the cap's rules (2026-10-27)
- **Built** (`finance/softCap.ts`): `payroll` (wages under contract plus those still owed to released players until their old contracts end; no amortisation), `clubCap` (the tier's cap, or for a relegated club its old tier's through its grace: `Club.capGrace`, `relegationGrace`), `canSignFreeAgent` (over the cap only at the minimum wage), `tradeFits` (over the cap, back at most 125% of the wages sent out), `luxuryTax` (1.5 × the payroll above the cap) and `shareTax` (equal shares among the tier's clubs under the cap, whole euros). Config `softCap` gains `minimumWage`, `luxuryTaxRate`, `tradeMatching`, `graceSeasons`. Not yet applied by the season (chunk 2).
- **Money approved by T (2026-10-27):** base cap €180m (caps €180m / €144m / €117m: Blue's median club at a 50% wage ratio, Gold's 44%, Star's 26%; the poorest Blue and Gold clubs, about €140–170m revenue, at ~77% until promoted); TV pools €3.2bn / €1.9bn / €1.3bn (flatter than before: €200m / €119m / €81m a club); minimum wage €300k; play-off prize money (Star €5m / €10m / €20m per round won, Gold and Blue €2m / €4m, the beaten finalist half the final's; `PlayoffFormat.prizeMoney`, none in Classic); tax 1.5×, matching 125%, one grace season. SPEC §17.7.

#### Chunk 2: the cap's rules in the season (2026-10-27)
- **Built:** the season close (`closeSeasonBooks`, 30 June) under a soft cap: each club's payroll against its cap (with grace), the luxury tax booked as an expense (`luxuryTax`) by clubs over the cap, each tier's total shared equally among its clubs under the cap (revenue `taxShare`), and the tax paid and shared returned for the harness (`SeasonClose.tax`). The FFP check runs only where the money rule is FFP (no breaches or bans in the Super League). Relegated clubs get their grace (`applyCapGrace`, in a save at promotion and relegation, and in the harness). No Youth dial is paid for where clubs have no academies. Play-off prize money is paid like a cup's, per round won and to the beaten finalist (`prizeIncome`; Classic's play-off has none). The money functions read the world's switches (`FinanceWorld.config`).
- **Checks:** lint; 385 unit tests (new: the tax booked and shared within a tier, FFP not run, no Youth dial cost, play-off prizes, the grace on relegation); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (acceptance passes; with the new money the rise averages 9.8 seasons); all 18 browser checks (416 passes).

#### Chunk 3: the cap and the AI's signings; the harness reports the cap (2026-10-27)
- **Built:** over its cap, an AI club signs free agents only at the minimum wage (`freeAgencyTopUp`). The season close also lists relegated clubs still over their own cap after their grace (`SeasonClose.tax.afterGrace`). The tier report (`pnpm calibrate --world superLeague`) reports club-seasons over the cap at 30 June, the luxury tax paid, and relegated clubs over their own cap after their grace (`TierSeason.cap`, from the harness's `SeasonReport.close`).
- **Found and fixed (T's choice):** the AI's summer re-signings used Classic's wage model, pricing a player against his club's revenue. Star clubs earn 2–7× the cap, so Star's median payroll was 1.3× its cap after one summer (up to 2.8× later): 73% of club-seasons over the cap and €165bn of tax in the report. Now, in a world with a cap, the AI prices re-signings as if the club's revenue were its cap ÷ 0.5 (`softCap.aiWageRatio`, the wage ratio the cap was set for) and keeps its wage bill within the cap (`wageScale`); its core players are still re-signed regardless, as SPEC §17.7 allows over the cap.
- **What's left, for SL5:** Star's median payroll still drifts to about 1.1–1.25× its cap (Gold and Blue to 1.0–1.2×): the AI re-signs every core player at his ask, and asks priced on cap ÷ 0.5 still run above the opening wages (Madrid Blancos' summer re-signings: €254m priced against the cap, €397m against its revenue). Report (seed "calibrate"): 58% of club-seasons over the cap, about €1.5bn of tax a season, 148 relegated clubs over their own cap after their grace. SL5's re-signing period (which core players the AI keeps, asks under a cap) and salary-shedding trades are where this gets settled.
- **Acceptance (MILESTONES SL3):** finance unit tests (the cap, grace, the tax, a released player's wages on the cap); the harness reports cap violations and tax paid.
- **Checks:** lint; 388 unit tests (new: free agents at the minimum wage over the cap, the after-grace flag, re-signings priced against the cap); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check`; all 18 browser checks (416 passes).

### SL4: Draft (from 2026-10-27)
Plan (about 6 chunks): 1 T's board rule, and prospects visible all season; 2 the lottery (odds table for T, the draw, tests over many draws, the standings' odds); 3 picks as owned assets, 3 seasons ahead; 4 the user's picks (worker calls); 5 the re-signing period (the user's re-signings; cap-aware AI choices), free agency from 1 July, the 25-player limit; 6 the 20-season acceptance (player pool and distributions). The draft screens come with SL7's UI.

#### Chunk 1: the board counts play-offs; prospects all season (2026-10-27)
- **T's board rule:** a board target can also be met in its league's play-off (`BoardTarget.playoffRound`: by reaching that round; `playoffWin`: by winning it). Star's top target is now "Compete for the title" (its 2 strongest clubs): met by reaching the title play-off's semi-finals; during the season the board reads a top-4 place. Gold's and Blue's "Win promotion" is also met by winning the promotion play-off. At the season's end a club that met its target in a play-off counts as having finished where the target asked (`metInPlayoff`, runner); Classic's targets don't use it, so Classic is unchanged. The parser refuses a target naming a play-off round the league doesn't have.
- **Prospects all season** (SPEC §17.5): a new player status, `prospect`. The class of a season's draft is generated on 1 July (and with a new world), born for its ages at the draft but rated from that day; prospects don't develop or retire before the draft. The draft picks from the class; on the next 1 July the undrafted join free agency (before the summer's free-agency signings) and the next class arrives (`draftClassTurnover`). The world checks count the class (110).
- **Checks:** lint; 389 unit tests (new: the board's play-off rule; the class picked from, waiting, then free agents and the next class; prospects don't develop in a played season); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (acceptance passes; active players count prospects now: 1,332 at the start); all 18 browser checks (416 passes).

#### Chunk 2: the lottery; three draft classes (2026-10-27)
- **T's decisions:** the lottery odds as proposed (chance at pick 1: Blue 16th 20%, 15th 17%, 14th 15%, 13th 13%; Gold's relegated 11% and 9%; Star's relegated 8% and 7%). Three draft classes always visible: each appears on 1 July two seasons before its draft. Prospects develop each summer while they wait (replacing the default that they didn't).
- **Built:** the lottery (`drawLottery`: 4 draws, each weighted by the odds of the clubs not yet drawn; the rest in odds order; seeded per season) in the draft's order; today's odds per club (`lotteryOddsNow`) on the live Standings, as a "Lottery" column shown only in a world with a draft. Prospects carry their class (`Player.draftSeason`); a new world starts with the classes of its first three drafts; each 1 July the undrafted of the June draft join free agency and the class two drafts on arrives (`classesAhead`); the draft picks from its own class. Prospects develop in the summer update only (no minutes, no club: about +1 OVR a summer), so a class generated ahead starts lower by `growthPerYear` (1, measured) a summer to come: classes reach the draft at about 53 OVR, the target. The world checks count three classes (330).
- **Checks:** lint; 392 unit tests (new: the lottery against the odds table over 50,000 draws, the order with the lottery, today's odds, three classes turning over); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (acceptance passes); all 18 browser checks (416 passes).

#### Chunk 3: picks as owned assets (2026-10-27)
- **"Up to 3 seasons ahead"** (SPEC §17.5, config `picksAhead`): built first as the coming draft plus three more (ZenGM's four seasons of picks); **T corrected it after the chunk (2026-10-27): the coming draft plus two more**, the same three drafts as the visible classes. Now `picksAhead` 2: 288 picks at any time (48 clubs × 2 rounds × 3 drafts).
- **Built:** a pick (`DraftPick`: season, round, original club, owner) in a new store, `draftPicks` (league DB v9; keyed by season, round and original club, so no new ID counter; an older save gets the store empty). A new world starts with every club's own picks for its first drafts (a world check); each 1 July the clubs get those of the furthest draft (`missingPicks`, with the new class); the draft gives each slot to its pick's owner (a traded pick takes its original club's slot, lottery included) and then deletes the season's picks. Player.draft records the club that picked. Nothing trades picks yet (SL5), so the draft and the harness run as before.
- **Classic:** unchanged; the new store is empty there, so the recorded Classic fingerprints gain one part, `draftPicks`, whose hash is the empty list's (every other hash as recorded).
- **Checks:** lint; 395 unit tests (new: the opening picks, only missing picks made, a traded pick's owner in the original slot, the season's picks used up, the picks three seasons on each 1 July, an older save's empty store); `pnpm build`; `pnpm generate --check` for both worlds (new check: 384 picks); `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (the report identical to chunk 2's); all 18 browser checks (in the full run `m6` and `career` each timed out on a click scrolling into view; both passed on rerun).

#### Chunk 4: the user's picks (2026-10-27)
- **Built:** the draft runs pick by pick in a save. The lottery's day sets the order (`setDraftOrder`: the lottery drawn, each of the season's picks numbered, `DraftPick.pick`). In the draft phase the Play menu offers "Until your pick" (the AI picks until the user's club is on the clock; shown while he has a pick to come and isn't on it) and "To the end of the draft" (the AI picks for everybody, him too); once every pick is made, "Until the re-signing period". Worker calls: `getDraft` (the order, picks made and to come, traded slots with their original club, the prospects left, who's on the clock) and `draftProspect` (the user's pick, only on the clock, only a prospect still there). `Player.draft` also records the club whose slot it was. The harness still holds the whole draft at once (`runDraft` = the order, then every pick): its report is identical to chunk 2's.
- **No Draft page yet** (SL7): on the clock the user can only play "To the end of the draft" in the browser.
- **Checks:** lint; 396 unit tests (new: the order numbered on the lottery's day, the AI to the user's turn, his own pick, the AI to the end; in a save: the Play options through the draft, his pick by the worker call, a second call refused); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (the report identical to chunk 2's); all 18 browser checks (416 passes).

#### Chunk 5a: the re-signing period (2026-10-27)
- **T's decision** after chunk 4: picks for the coming draft plus two more (`picksAhead` 2; see chunk 3).
- **Built:** in a world with a re-signing period (SPEC §17.6) contracts are renewed only then, final-year players only. The AI decides as the period closes (ZenGM: its re-signings are the first step of 1 July, before contracts expire; `aiRenewals(…, "resigning")`), and renews nobody with years left (no summer or winter renewals there). Its wage bill is then the payroll that stays (released players' wages included) plus each re-signing's whole wage. The user renews in the period only, final-year players only: `ContractTalks.closedReason` says why not otherwise (the contract modal shows it), and the worker refuses. His inbox lists his final-year players as the period opens.
- **The cap (a default for T):** with only final-year players re-signed, 44% of club-seasons ended over the cap (55% before). The AI's core players were re-signed whatever the payroll; now only while it stays within the cap plus 10% (`softCap.coreOverCap`; SPEC §17.7 `[DEFAULT]`). Measured on the tier report (3 worlds × 20 seasons):

  | Core re-signed over the cap | Club-seasons over the cap | Luxury tax paid, all | Over after grace | The rise |
  | --- | --- | --- | --- | --- |
  | unbounded (T's rule as built) | 44% | €54.8bn | 101 | 9.9 seasons |
  | to cap + 25% | 44% | €36.0bn | 112 | 11.3 |
  | **to cap + 10% (default)** | 41% | €15.3bn | 107 | 8.9 |
  | not over the cap | 17% | €0.6bn | 51 | 9.9 |

  Many clubs end a little over: rookies (signable over the cap) and minimum-wage free agents come on top. SL5's salary-shedding trades work on the rest.
- **Checks:** lint; 397 unit tests (new: the AI's re-signings at the period's close, only contracts that ended, within the cap and its allowance; in a save: renewals refused outside the period and for players with years left, the inbox list, a renewal in the period, the rest gone on 1 July, the AI's re-signings only of ended contracts); `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check`. The browser checks run with 5b.

#### Chunk 5b: free agency from 1 July; the 25-player limit (2026-10-27)
- **Free agency** (SPEC §17.6, config `freeAgency`): open from 1 July to the roster deadline, the day of the league's round 18 (60% of 30; `rosterDeadline`, early February), closed from then to 1 July. AI clubs no longer sign everyone on 1 July: they sign on market days, weekly from 8 July (the user has the first go), up to 22 seniors until 31 August, then only to fill a gap (below 18, up to 18), at most 2 a club a day (`freeAgencyDay`; first values, mine, for SL6 to tune). The user's free-agent signings follow the same dates (`ContractTalks.closedReason`), and under a cap his wage room is the cap's (room under it, or the minimum wage).
- **The 25-player limit** (SPEC §17.4, `rosterRules.maxSeniorFromFirstMatch`): counted from the season's first league match, so a club may hold more in the off-season (the draft, free agency; the user's signings aren't capped then). On that matchday AI clubs over 25 release their least valued players (OVR and POT as the draft weighs them), keeping two keepers, paid to the end of their contracts (`trimSquads`, with the user's release, now one function `releaseToFreeAgency`). The user over 25 stops on the eve of that match: no Play options, and `GameState.blocked` says how many to release (a banner in the Shell with a link to his squad).
- **The tier report** counts seniors per club at the first league match (was: after the summer, before the AI's signings moved into July and August): 22–25 in every world. Free agents on 1 July: 90–280 (they now wait for the market days).
- **Not yet in the UI** (SL7): the Free Agents page and the contract modal still show Classic's squad and budget lines. The Super League can't be picked at New game until SL7.
- **Checks:** lint; 401 unit tests (new: the roster deadline and market days, signings up to the summer target and then into gaps, AI squads trimmed to 25 keeping two keepers; in a save: free agency closed after the deadline, the user's Play stopping on the eve of the first match over 25, and going on once he releases); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (acceptance passes; the rise 9.1 seasons, 42% of club-seasons over the cap, €16.0bn tax, 110 over after grace); all 18 browser checks, covering 5a and 5b (416 passes).

#### Chunk 6: the 20-season acceptance (2026-10-27)
- **Built:** the tier report (`pnpm calibrate --world superLeague`) gates the world's health as MILESTONES SL4 asks, with Classic's checks: active players after every season within ±10% of the start; senior mean OVR (±1.5) and the 75+ share (±1.5 pts), last season against season 1; peak age (27–29 rated at least as 21–26, less 1) and retirement ages (most at 33–37, keepers later). The squads are measured at each season's first league match (`squadShape`): in the summer they're still forming, as free agency runs to the deadline. Drifts are gated from 10 seasons, as Classic's.
- **The age shape (a default for T):** seniors' mean age (±1 year) and the under-23 and 30+ shares (±5 pts), last season against **season 10**, not season 1 (`fromSeason`, calibration_targets.json). Against season 1 it fails: a closed world of draftees, 96 a year at 17–19 (two rounds, T's minimum), settles younger than the generated start, then holds:

  | Seniors at the first match | Season 1 | Season 10 | Season 20 |
  | --- | --- | --- | --- |
  | Super League, under 23 (3 worlds) | 27% | 39% | 38% |
  | Super League, mean age | 26.4 | 25.3 | 25.3 |
  | Classic, under 23 (1 world, information) | 24% | 47% | 44% |
  | Classic, mean age | 26.8 | 24.7 | 24.8 |

  Classic's academies make its seniors younger still, so the shift isn't the draft's alone. Raising the AI's free-agency squad target to 24 or 25 moved the Super League's under-23s by only 2–3 pts and cost OVR; the lever would be the AI keeping fewer draftees (releasing weak second-rounders for older free agents, as ZenGM's AI cuts), an AI change for T to choose. The report prints the change from season 1 as information.
- **Results** (3 worlds × 20 seasons): every gate passes. Active players at worst 6.0% off the start; mean OVR −0.3, 75+ +1.1 pts; from season 10 mean age +0.1, under-23s −1.6 pts, 30+ −1.7 pts; peak age 68.1 v 68.1; retirements 93% at 33–37, keepers 36.5 v 34.8. Free agents 90–280.
- **Checks:** lint; 402 unit tests (new: the player count against the start, the squads' drift from season 1 and from a later season); `pnpm build`; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (all gates pass). Only the harness, its targets and docs changed: no browser checks needed.
- **SL4 is complete.** For T: the cap's core allowance (chunk 5a, 10%), free agency's first values (chunk 5b) and the age shape's gate from season 10 (this chunk) are defaults to confirm.

### SL5: Trades (from 2026-10-27)
Plan (about 6 chunks): 1 trade valuation (players, picks, contract, cap room, team state; the exploit checks); 2 the trade itself and its rules (who and what can be traded when, the squad limit, salary matching over the cap), the user's proposals and "What would make this work?" (worker calls); 3 AI-to-AI trades on market days while trades are open, with harness measures; 4 AI salary shedding after a grace season, and which core players the AI keeps under the cap (the harness check: over-cap relegated clubs back under within a season of their grace); 5 AI offers to the user (inbox), the trading block, the transfer market and loans refused by switch; 6 tuning and the acceptance. The Trade, Trading Block and draft-pick screens come with SL7's UI.

#### Chunk 1: trade valuation (2026-10-27)
- **Built** (`market/tradeValue.ts`, config `trades`): what a trade is worth to a club, in value points (1 = a 75-rated player in his prime on a fair contract), ZenGM's idea written fresh. A player: exponential in OVR plus a share of a young player's headroom to POT (contending 30%, rebuilding 80%), less 15% a year past 30 for a contender (25% past 27 rebuilding), times his contract (fair wage = the going rate at the club's cap, scaled to the league's actual wages, 0.735 of it in a new world; ×0.5–1.3 by wage against fair and years left) and ×0.9 (contending) or ×0.4 (rebuilding) in a final year. A squad counts by place (best 11 fully, 12–18 half, 19–25 a fifth, beyond nothing). A pick: what its slot takes from a typical class (the visible classes valued place by place), ×0.7 to a contender, ×0.8 a draft further away; its slot is its number once drawn, else its original owner's place in the projected order (`projectedSlots`: the tables, or squad strength before a match, through `draftOrder`). Cap room: the payroll costs 0.5 points per cap's worth under the cap, 2 above it (×1.5 rebuilding). `valueChange` sums squad, picks and cap room, after less before; a club will take a trade that raises it (chunk 2).
- **Team state (a default for T):** a club contends when its board target is one of its league's top two (Star: title or top eight; Gold and Blue: promotion or play-offs): 20 of 48 clubs; the other 28 rebuild.
- **Measured** on a new world: a rebuilding club values pick 1 like a 77-rated player in his prime (1.35 points), pick 48 like a 68 (0.35), pick 96 0.06; a contender a third of that. Two average players for a star: all 911 offers refused (the closest −0.40). A star for four starters rated 72–74: accepted 17 times of 87 (depth for a star, allowed: the squad weights make it costly).
- `draftOrder` takes a projected outcome (tables and moves) as well as a season's.
- **Checks:** lint; 407 unit tests (new: two average players never buy a star, over every star 78+ and every club's best average pair; a pick's value falls a draft further away and with a stronger original owner, both rounds, all three drafts; contending against rebuilding; the contract's price; cap room over and under the cap); `pnpm build`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (the report as chunk 6's). Nothing plays trades yet: no browser checks needed.

#### Chunk 2: the trade, its rules, the user's proposals (2026-10-27)
- **Built** (`market/trades.ts`): the trade calendar (`tradeCalendar`, `tradesClosed`: open from 1 July to the roster deadline, both included, and from the day after the season's last match to 30 June); the rules (`tradeProblems`, reasons in words): two different clubs, each giving only its own squad players and the picks it holds (no prospects or free agents), nothing twice, something changing hands; final-year players not once the season is over; while the squad limit counts, no club ends above 25 unless the trade lowers its number (a default: in the off-season it may, as the limit counts from the first match); over the cap, wages back at most 125% of those sent. The trade (`applyTrade`): players move with their contracts (a free shirt number, a "trade" entry in their history), picks change owners, one "trade" transaction ("A and B trade: A get …; B get …"). The AI says yes when its value change is above zero (`aiAccepts`). "What would make this work?" (`makeItWork`, ZenGM's): the AI asks for more of the other club's players and picks, one at a time, up to `trades.makeItWorkMaxAdded` (4): the addition that makes the trade good enough for it at the least overpayment, else the one that helps it most, only additions that keep the trade valid.
- **Worker calls** (`league/trade.ts`): `proposeTrade` (refused with the rules' reasons, or by the club, or made and saved at once) and `makeTradeWork` (the trade the club would take, and its reply). Both refuse in a world with transfers. Values use the tables once a league match is played, squad strength before. The Transactions and Player pages label "Trade"; the Trade page is SL7's.
- **Seen on a new world** (Lyon, Blue, asking): contending Lille wants a 2029 first-round pick for its 68-rated squad player, and a 66/77 youngster plus a 2027 first for its 72; rebuilding San Sebastián swaps a 67 for a 67; North London Gunners' 80-rated star: nothing of Lyon's would do. Each answer takes 5–16 ms.
- **Checks:** lint; 414 unit tests (new: the trade calendar; what can be traded, picks held, final years once the season is over; the limit of 25 before and after the first match; wage matching over the cap, and shedding allowed; players and picks moved, the transaction's words; the AI's yes and "What would make this work?"; in a save: refused, made to work, made and saved, a rule's reason, another club needed; refused in a Classic save); `pnpm build`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (the report unchanged: the AI doesn't trade yet); all 18 browser checks (416 passes).

#### Chunk 3: AI-to-AI trades (2026-10-28)
- **Built** (`market/aiTrades.ts`, config `trades.ai`, first values): trade days a week from 8 July to the roster deadline (`tradeDays`), run by the season's day loop in saves and the harness alike. On each, three times, a random AI club shortlists the other AI clubs' players it values most above their own club's value of them (5, more than 0.05 apart), picks one at random and asks the owner what would make it work (`makeItWork`, chunk 2). The trade goes ahead when both clubs gain, it passes the rules, and neither club ends below 2 keepers, 6 defenders, 5 midfielders or 3 forwards unless it already was. Values read the tables once a league match is played. The user's club takes no part (its offers are chunk 5). A save stores picks that changed owners.
- **Churn (a default for T):** in a first run Nwankwo moved three times in under a year. An AI club now keeps a player it got by trade for 90 days (`keepAcquiredDays`) before it trades him on, or offers him in a trade.
- **What they look like** (season 1 of a harness world): contending clubs sell young prospects (70/80 at 18–20 on rookie wages) to rebuilding ones for proven players or picks; rebuilding clubs pay picks for prospects (three first-rounders and a 64/75 for a 70/81 once); some like-for-like swaps of starters where wages and ages differ.
- **20 seasons** (3 worlds): 22.1 trades a season (10–40), 1.9 players and 0.4 picks a trade. Every gate passes. Against chunk 6's run: the rise 9.5 seasons (9.1), club-seasons over the cap 39% (42%), tax €14.9bn (€16.0bn), opening Star clubs still there after 20 seasons 8, 6, 7 (3, 4, 6), wall time 57 s (41 s).
- **Checks:** lint; 417 unit tests (new: the trade days; AI trades both clubs gain by (each checked against the world just before it), by the rules, keepers kept, the user's club left out, nobody traded on within 90 days; the same for the same seed, none while closed; in a save's season: AI trades made and their picks saved); `pnpm build`; `pnpm generate --check` for both worlds; `pnpm calibrate --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (above); all 18 browser checks (416 passes).

#### Chunk 4: shedding wages after relegation (2026-10-28)
- **Built:** a relegated AI club works its payroll down to its own tier's cap from the summer it goes down to the close of the season after its grace, when it must be under it (MILESTONES SL5). It re-signs against its own tier's cap, its grace season too (`renewals.ts`; the grace now only spares it the tax). On each trade day it sheds first (`aiTrades.ts`): it offers its players of least value a euro, those it would let go for nothing without being left short in an area, 4 at most, each to the 5 clubs with room for his wage under their line that could take him by the rules and value him most; the receiver may ask for its picks (not players: they'd be wages back) to make it work. One such trade a club a day. Its line (`ClubView.line`) is its own cap less 3% and less its coming draft's rookie wages by slot (`rookieRoom`), as those count at the close; the part of its payroll above the line weighs 12 value points per cap's worth (`salary.mustShed`). Player values are kept for the day (`cachedValue`).
- **How it got there** (relegated clubs still over their own cap the season after their grace, 20 seasons × 3 worlds; 110 before): every AI club over its cap shedding from the day its grace ends, 60; with room for rookies, 94 (the lower line set more clubs shedding, all after the same little room); relegated clubs only, from their relegation, 15 (promoted clubs have new room then); receivers filtered by the rules first, 14; re-signing against the own tier's cap, 7; a 3% margin, **2**. Two of the 7 left were over by about their rookies (the lottery gave an earlier pick than projected), the rest by €2–7m.
- **Other clubs over their cap (a default for T):** they don't have to shed; they pay the luxury tax (`shed.overCapClubs` false). With them shedding too, 26% of club-seasons ended over the cap (36% without), but they took the room the relegated clubs needed: 57 stayed over.
- **The gate** (tier report, a default for T): relegated clubs back under their own cap at the close of the season after their grace in at least 98% of the relegations the run can judge (`relegatedBackUnderCap.maxStillOver` 0.02).
- **Results** (20 seasons × 3 worlds): back under in 214 of 216 relegations; 49.4 trades a season (14–94; 22.1 before shedding), 1.4 players and 0.4 picks a trade; club-seasons over the cap 36% (39% after chunk 3), tax €13.5bn (€14.9bn); the rise 9.8 seasons; every gate passes. Seniors at the first match now 18–25 a club (22–25): clubs that shed refill only below 18 after August. Wall time 87 s (57 s).
- **Checks:** lint; 420 unit tests (new: a relegated club past its grace sheds first, gives a player and takes none back, its payroll falls, the receiver stays under its line, an unrelegated club over its cap doesn't have to; the rookie room by slot, a traded pick's rookie the holder's; a relegated club re-signs against its own tier's cap through its grace and after, as an unrelegated one, and fewer than against Star's); `pnpm build`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (above); all 18 browser checks (416 passes).

#### Chunk 5: AI offers to the user, the trading block, no transfer market (2026-10-28)
- **AI offers to the user** (`aiOfferToUser`, on trade days; config `trades.ai.offers`, first values): 30% of trade days, an AI club offers for one of his players what an AI club in his place would take (`makeItWork` for his club), if it gains too. Which player: of his players, the 5 AI clubs are keenest on (what he'd add where he'd stand in their squad, by the squad weights, against what he adds to his), each with its keenest club, the first in random order that makes such an offer. Weighing by place mattered: by value alone the keenest club was always the strongest, which wouldn't play him, and no offer could be made. An offer gives him something: if his club would let the player go for nothing, the club adds its asset that costs it least. It goes to his inbox (`InboxMessage.tradeOffer`: club, what he gives and gets, its last day, its status) and stands 7 days, to the deadline at most; one stands at a time (`LoopWorld.openTradeOffers`), and a player isn't asked for again within 60 days (`offeredFor`). Seen on a new world: Lyon (rebuilding) is offered swaps of squad players (a 63 for a 56, a 64 for a 59); Madrid Blancos a 74-for-74 swap with a pick.
- **Answering** (worker call `respondToTradeOffer`): turned down, it's answered; accepted after its date, "it stood until …"; accepted while it stands, the trade is checked again (the rules, and the club's value: it may have changed its mind) and made at once.
- **The trading block** (worker call `getTradingBlock`, `bestOffer`): he puts up players and picks (checked: trades open, his own, tradable); each AI club that would take them adds, one at a time and up to 4, its asset worth most to his club while the trade stays good for it and valid; the 5 best for him come back as proposals he can make with `proposeTrade`. One request builds 45 clubs' offers in about 0.5 s (Node): SL7's page should show that it's asking.
- **The transfer market and loans off by switch:** bids, the transfer list, loans and contract talks with another club's player are refused in a world with trades (and without loans); Classic's market days run only where the market is transfers.
- **Checks:** lint; 423 unit tests (new: an offer to the user both clubs gain by, giving him something, to his inbox with its players, one at a time, none without a user or while closed; the best offer a club makes for what another puts up; in a save: bids, the transfer list, loans and transfer talks refused, the trading block's offers (5 at most, each what he put up for something) and the best made, offers in the inbox, answered after their date, accepted, turned down and not again); `pnpm build`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (the report as chunk 4's: the harness has no user); all 18 browser checks (416 passes).

#### Chunk 6: tuning and the acceptance (2026-10-28)
- **The exploit checks on evolved worlds** (tier report, gated): SL5's two checks now also run on each 20-season run's final world (`tradeExploits`, board targets set as the next season would open). Picks: 0 of 2,844 pairs out of order (a draft later, a stronger original owner), for a contending and a rebuilding club. Two average players for a star: the AI's full valuation took 81 of 995 such offers. All of them were stars on big long contracts at rebuilding clubs, most at relegated clubs shedding wages: a fire sale through the cap, not two average players adding up to a star. The gate checks what the valuation promises (SPEC §17.6): in talent by squad place, contracts and cap room aside, two average players never equal a star. That failed 7 times, all for one 31-year-old star at a rebuilding club, valued at 0.27 of his talent: rebuilding clubs' decline now starts at 28 and is 20% a year (was 27 and 25%), and it passes (0 of 885–1,293 across seeds). The offers taken with contracts and cap counted are reported: 8–12% across seeds, for T.
- **Relegated clubs back under their cap:** the 2 of 216 at chunk 4 was a lucky seed: across three seeds 6–16 stayed over. Rookie room now counts a pick in the lottery pool as its round's first (half the misses were over by about their rookies' wages). Two shedding trades a day and 6 players tried changed nothing (13, 17, 6 over) and nearly doubled the run time, so they're back to 1 and 4 (`shed.perDay`, config). The rest stay over because hardly any club has room under its cap to take their wages: AI clubs re-sign up to it. Gated at 10% still over (a default for T); measured 10, 10 and 14 of 216 (5–7%).
- **Picks held** (reported): at the end of a run no club holds none, the most a club holds is 10–12 (its own are 6).
- **Across seeds** (calibrate, spread-a, spread-b): 47–54 trades a season; club-seasons over the cap 37–38%; the rise 7.6, 9.2 and 11.0 seasons (gated from SL6; three worlds are a small sample). Seed spread-a's 75+ share drifts +1.6 pts (Classic's band ±1.5; the default seed passes): SL6's tuning.
- **Checks:** lint; 423 unit tests (changed: a contender values a 32-year-old over half as much again as a rebuilding club does, with the softer decline); `pnpm build`; `pnpm generate --world superLeague --check`; `pnpm calibrate --world --check` (main's numbers); `pnpm calibrate --world superLeague --check` (all gates pass on the default seed; two more seeds above); all 18 browser checks (416 passes).
- **SL5 is complete.** For T: who contends (the board's top two targets, chunk 1); the star for four starters (chunk 1); offers taken with contracts and cap room counted (8–12%, above), or a star premium so a club never lets its star go for two average players; non-relegated clubs over the cap paying the tax rather than shedding (chunk 4); the relegated clubs' gate at 10%; if T wants them all back under, a relegation wage clause (wages cut on relegation, as in football contracts) would do it where trades can't.
- **T's answers (2026-10-28):** who contends changes: about 3 or 4 clubs a league, more or fewer by how close the top is that season (`contenders`: the clubs within 1 OVR of the league's strongest by their best 11, injured players too, 2 to 6 a league, judged on the day's squads; config `trades.contending`). Over 10 seasons of a harness world: 3.4 a league (2–6). The rest stands as built: the star for four starters, offers taken with contracts and cap room counted (now about 16%: more clubs rebuild), clubs over the cap paying the tax, the relegated clubs' gate at 10%, no relegation wage clause. Design doc #90. 20 seasons × 3 worlds after the change: every gate passes; 43.9 trades a season; 5 of 216 relegated clubs still over after their grace; the rise 8.2 seasons. Checks: lint; 423 unit tests (changed: contenders are 2 to 6 a league, the strongest); `pnpm build`; `pnpm calibrate --world superLeague --check`. Classic doesn't trade: its numbers can't move.

### SL6: Validation and tuning (from 2026-10-28)
Plan (about 5 chunks): 1 measure the rise properly (a breakdown by league, more worlds, config overrides for experiments); 2 find the bottleneck and tune AI coefficients first; 3 if that isn't enough, a table of T's levers (cap shares, TV pools, lottery odds, class size and quality, rookie wages) with measured effects; 4 T's choice applied, the rise gated at 4–6 on CI's seed, the other §17.9 items checked, docs; 5 buffer and CI time.

#### Chunk 1: measuring the rise (2026-10-28)
- **Built:** the tier report takes `--overrides` like `pnpm calibrate --world`'s, now also a world's config by its id (`{"superLeague":{"softCap":{...}}}`, `overrides.ts`), for experiments. The rise is taken apart (`riseBreakdown`): the seasons the rises that made it spent in each league, where unfinished rises stand when the runs end, how promoted clubs do in their first season up (into Star: top 8; into Gold: up again at once), and each world's average.
- **Measured** (6 worlds × 20 seasons, two seeds; T's contending rule):

  | | CI's seed | another seed |
  | --- | --- | --- |
  | The rise: average (median) | 9.1 (8) | 9.0 (8) |
  | Rises that made it / still on the way | 68 / 120 | 57 / 131 |
  | Seasons on the way: Blue, Gold, Star | 4.7, 2.9, 1.5 | 4.7, 2.9, 1.4 |
  | Still on the way, in: Blue, Gold, Star | 74, 41, 5 | 80, 49, 2 |
  | Promoted into Star: mean finish, top 8 in the first season | 7.8, 56% | 8.0, 55% |
  | Promoted into Gold: mean finish, up again at once | 7.0, 22% | 7.3, 18% |
  | Each world's average | 8.3, 7.9, 8.4, 10.2, 8.8, 10.9 | 9.4, 9.2, 10.1, 6.2, 9.5, 9.5 |

  A world's own average swings 6–11, so 3 worlds read 7.6–11.0 across seeds while 6 read 9.0–9.1. Every other gate passes on both seeds with 6 worlds.
- **What it says:** the rise is slow at its start. A club from Blue's bottom four takes 4.7 seasons on average to get out of Blue, then 2.9 in Gold; once in Star it's quick (56% of promoted clubs finish in the top 8 at once). Two thirds of the rises never finish in 20 seasons, most of them still in Blue. For an average of 4–6, getting out of Blue would have to take about 2 seasons.
- **Checks:** lint; 424 unit tests (new: the breakdown); the tier report on 6 worlds, two seeds, every gate passes. Harness only.

#### Chunk 2: why the rise is slow (2026-10-28)
- **Built** (harness): each club's strength at the first league match (`squadStrength`: its best 11's mean OVR, injured or not), and per league in the report (`tierStrengths`): the mean, the spread (strongest less weakest) and how much strength decides the table (rank correlation between strength and final position).
- **Measured** (6 worlds × 20 seasons, CI's seed; the rise as chunk 1, 9.1):

  | League | Mean strength | Strongest less weakest | Table against strength |
  | --- | --- | --- | --- |
  | Star | 71.1 | 5.6 | 0.34 |
  | Gold | 69.8 | 5.7 | 0.35 |
  | Blue | 69.4 | 5.4 | 0.31 |

  Following each club from a finish in Blue's bottom 4 (3 worlds): it is only about 2 OVR below Blue's second strongest, finishes 8th on average the next season (regression to the mean), and stays about 1.4 below; a club's strength moves about 1 OVR a year (sd 0.95). Pick 1 rookies are 65.8 at the draft (they play at once in Blue, whose 11th best is 62.3); the 5 best free agents on 1 July average 73.3, and 80% of the 70+ free agents sign at the minimum wage, with whichever club has the fewest players (over the cap a club signs anyone at the minimum wage).
- **What it says:** the rise is mostly luck. The tiers stand less than 2 OVR apart (the draft hands the best prospects to the weakest clubs, the caps even out payrolls, free agents go to whoever has room in the squad), and within a tier strength explains a third of the table. A club from Blue's bottom 4 is barely weaker than the clubs that go up, and nothing lets it get clearly stronger quickly, so it waits for a good season: 4.7 seasons in Blue, 2.9 in Gold; Star's top 8 is easy (56% at once) as Star is barely stronger.
- **Tried, my levers, rejected:** wider prospect quality (sd 9, max 72: lottery picks better at once): the rise worse (10.6), the 75+ share +7.8 pts, the relegated clubs' gate failed. Free agents keeping their asks (over the cap only those asking the minimum, so good ones go to clubs with room): squads couldn't be refilled (asks fall to 60% of the going wage, never to the minimum) and a club was left with 9 players; reverted. That needs a free-agent market redesign (asks falling to the minimum over time, ZenGM style, in this world), a design choice for T. Small changes swing a 3-world run a lot (one wage rounding moved the rise 8.2 to 10.3), so experiments need 6 worlds.
- **Checks:** lint; 425 unit tests (new: tier strengths); the tier report on 6 worlds (the rise as chunk 1's). Harness only.

#### Chunk 3: 3 up and 3 down; the rise reported (2026-10-28)
- **T's decisions (2026-10-28):** 3 up and 3 down between tiers (was 2 and 2), and the rise "is not too important": it stays in the report against its 4–6 target, not gated. Design doc #91.
- **Built (config):** Star and Gold relegate 3; Gold and Blue send their top 2 up and the winner of a play-off among 3rd–6th (single-leg semi-finals, 3rd hosts 6th and 4th hosts 5th, a neutral final). Board targets follow: "Win promotion" is a top-2 finish or the play-off, "Reach the play-offs" 6th, Star's "Avoid relegation" 13th. The lottery pool stays as approved (Blue's bottom 4, Gold's and Star's bottom 2), so the third relegated club of Gold and Star (14th) picks by reverse standings (a default for T); the 6 promoted clubs pick 43–48. Standings zones and the draft order follow the config with no code change.
- **Measured** (6 worlds × 20 seasons, CI's seed): the rise 8.4 seasons, median 8 (9.1 with 2 and 2): 4.4 in Blue, 2.6 in Gold, 1.4 in Star; promoted into Star, 49% finish in the top 8 at once. Yo-yo clubs 27% (18%), moves 0.25 a club a season (0.17), 41–45 distinct Star clubs per world. Tier strengths as before (Star 71.2, Gold 69.8, Blue 69.3; strength against the table about 0.32). On 6 worlds two gates fail at the edge: relegated clubs still over their cap after their grace 86 of 648 (13%; the gate is 10%: 6 relegations a season now share the little room under the caps) and the 75+ share +1.7 pts (±1.5). CI's run (3 worlds) passes every gate: 28 of 324 (8.6%) and +1.3 pts.
- **For T:** the relegated clubs' gate at 15% would hold with 3 down; it stays at T's 10% (CI passes) until he says.
- **Checks:** lint; 425 unit tests (changed for 3 up and 3 down: the moves, Gold's and Blue's play-off pairs and promotions, zones, the draft order with 6 promoted clubs, pick slots, the parsed config, the harness's move check); `pnpm build`; `pnpm generate --world superLeague --check`; `pnpm calibrate --world superLeague --check` (CI's 3 worlds: every gate passes). Classic's config untouched.
- **SL6:** with the rise reported, not gated, and every gate passing on CI's seed, SL6's acceptance is met: complete, with chunks 4 and 5 folded in (CI's run stays at 3 worlds, about 2 minutes locally).

### SL7: UI (from 2026-10-28)
Plan (about 6 chunks): 1 the world in the UI (the shell knows the save's world and switches; the sidebar without the Transfer Market and Youth Academy where they're off; New game's world choice; the top bar's trades badge; no bids, transfer list or loans on player pages); 2 Standings for three tiers (zones, the lottery-odds column) and a Play-offs page (brackets); 3 the Draft page and the team's draft picks; 4 the Trade page, trade offers answered in the inbox, the Trading Block; 5 Re-sign Players, free agents and contract talks under the cap, Finances with the cap; 6 the names file at New game, How to play's Super League section, browser checks through 3 seasons. Acceptance (MILESTONES SL7): T runs a Super League club through 3+ seasons in the UI; every Classic browser check passes.

#### Chunk 1: the world in the UI (2026-10-28)
- **Built:** the shell carries the save's world (`LeagueShell.world`: id, name, switches) and pages can name the switches they need (`PageDef.when`): the Transfer Market shows where the market is transfers, the Youth Academy where youth is the academy. `GameState.trades` gives the trade window in a world with trades (open to the roster deadline, or to 30 June after the play-offs; closed until the play-offs end), shown in the top bar as Classic's window is. The player page offers no bid, transfer list or loan where they're off. New game offers Classic and the Super League (a card each, with a line on what it is; the clubs follow the choice).
- **Browser check `superleague`** (new, to grow with SL7): New game's choice and the Super League's three tiers, a Blue club started, the top bar's trades badge, the sidebar, a player's buttons.
- **Checks:** lint; 425 unit tests; `pnpm build`; all 19 browser checks (423 passes: Classic's 416 and the new check's 7).

#### Chunk 2: Standings and Play-offs (2026-10-28)
- **Standings** already had the three tiers (league tabs), the zones from the config and the lottery-odds column (SL4): checked in the browser for 3 up and 3 down (Blue: champions and the 2nd promoted, 3rd–6th play-offs; Star: the top 8 in the title play-off, the bottom 3 relegated). Where a play-off decides the title the legend says "Title play-off" (Classic's "Play-offs" unchanged).
- **Play-offs:** the Cups page already showed each league's play-off round by round; in a world without cups (`LeagueShell.world.cups`) it's called Play-offs, in the sidebar (`PageDef.titleIn`) and on the page. Before a play-off is drawn it shows its first round if the season ended today (`CupView.projection`, from the live table: the fixed ties as configured, or the entrants best against worst), with each club's position; the user's tie outlined.
- **Browser check `superleague`:** Standings' zones and lottery odds, the Play-offs page's tabs and projections, then a whole season: Star's 7 ties played and its winner.
- **Checks:** lint; 425 unit tests (extended: a save's play-off projections before the season's end, none after); `pnpm build`; all 19 browser checks (430 passes).

#### Chunk 3: the Draft and the team's draft picks (2026-10-28)
- **Draft page** (Players section, worlds with a draft; ZenGM's place): a draft is named by the year it's held ("2027 draft" for 2026/27's). This season's shows the lottery pool from the tables (if the season ended today, once a league match is played; the final tables after), each club's league, place and odds, and after the draw its pick with ▲/▼ against odds order; the prospects left (sortable, searchable); the board of both rounds (club, "via" for a traded slot, the player taken, the pick on the clock and the user's highlighted). A line on top says where the draft stands. On the clock, each prospect has a Draft button. A dropdown shows the drafts held (their boards) and the two classes to come (their prospects).
- **Play menu:** "Until the draft lottery", "Until the draft" and "Until your pick" open the Draft page afterwards (ZenGM does the same). A pick is on the clock from the draft's day, not on the lottery's (`DraftView.onTheClock` was 1 from the lottery on).
- **Draft Picks** (Team section, any club): the picks it holds for the coming draft and the two after it: number once the lottery has set it, before that this season's projected (~12; "(lottery)" when in the pool, whose draw can move it) from the tables, by squad strength before a league match (as trade valuation projects it; `playedTables`, now shared with the trade calls); the slot's club when traded in; its own picks other clubs hold.
- **Player profile:** "Drafted: 2027 round 1, pick 12 by LYO" (and the slot's club when traded), the SPEC §17.5 default.
- Tidy-up: `ordinal` moved to `format.ts` (it was copied in four pages).
- **Browser check `superleague`:** after the season, Draft Picks (six picks, this season's projected), the Draft before the lottery (pool of 8, 110 prospects, the classes to come), the lottery's draw (picks 1–8, a board of 96), "Until your pick", drafting a prospect from the page, "To the end of the draft", the draftee's profile.
- **Checks:** lint; 425 unit tests (the save's draft test extended: the pool and its odds before and after the draw, the user's picks projected then numbered, a class to come, a held draft's board); `pnpm build`; all 19 browser checks (437 passes: Classic's unchanged, the Super League's 21).

#### Chunk 4: Trade, Trading Block, offers in the inbox (2026-10-28)
- **Trade page** (Players section, worlds with trades; ZenGM style): a club dropdown (every club but his, by league); the other club's squad and picks, then his, a tick box each (a player his club can't trade, a final-year player once the season is over, has ✕ with the reason); a summary: what each side gives, each payroll now → after against its cap (red when over), each squad now → after, and the rules the trade breaks (the worker's `tradeProblems`, so the page and the trade agree). "Propose trade" (off while a rule is broken) puts it to the club: made at once or turned down; "What would make this work?" loads the trade the club would take, with its words; Clear. Worker call `getTrade` (`views/trade.ts`): both sides and the trade less what no longer belongs to either club.
- **The trade in progress** is kept per league in the tab (sessionStorage, `tradeDraft.ts`; memory if storage fails), so it survives a reload or a look at a player; another club keeps his side and empties theirs (ZenGM).
- **Trading Block** (Players section): he ticks players and picks, "What are they offering?" brings the five best offers (`getTradingBlock` now returns his side and the offers with the players and picks each club gives); "Negotiate" opens one on the Trade page, where he proposes it.
- **Inbox:** an AI club's open offer has a "Trade offer" badge and Accept, Turn down, and Open in Trade; answered or lapsed, its status.
- **Player profile:** "Trade for him" on another club's player opens the Trade page with him asked for (ZenGM's Trade For).
- `useView` can keep the last data while a new key loads (`stale`), so ticking a box doesn't blank the Trade page. `draftName` moved to `format.ts`; `heldPicks` gives every club's picks with one projection.
- **Browser check `superleague`:** after the draft: Trade (tick their weakest player, "What would make this work?", propose, he's in the squad), the Trading Block (offers, Negotiate loads one), "Trade for him", then preseason weeks until an AI offer comes to the inbox, turned down there.
- **Checks:** lint; 425 unit tests (the trade tests extended: the page's sides, payrolls and squads after, a made trade dropping out; the block's offers with their players and picks); `pnpm build`; all 19 browser checks (446 passes: Classic's unchanged, the Super League's 30).

#### Chunk 5: re-signing, free agents and finances under the cap (2026-10-28)
- **One cap summary** (`CapView`, `views/cap.ts`): payroll (contracts plus wages owed to released players), the club's cap, the room or how far over, the most a free agent's wage can be (the room, or the minimum wage over the cap), the luxury tax if the season ended today, and a grace season (the old tier's cap, to when). The worker's rules read the same numbers.
- **Re-sign Players** (Players section, worlds with a re-signing period; ZenGM's page): the user's final-year players with their wage, mood (✕ when he won't talk) and lowest ask, a Negotiate button each (the contract talks; renewals only while the period is open, from 16 to 30 June); the cap now, and next season's wages already committed (contracts past 30 June, released players still owed) against next season's cap in his league as it stands. Shown all year: outside the period it says when it opens. Worker call `getResigning`.
- **Squad page:** an expiring player's "E" badge says whether he'd re-sign ("E✕" in red when he won't, as things stand), in a world with a re-signing period (SPEC §17.6).
- **Contract talks** under a cap show the cap summary and the squad (the limit counts from the first league match) in place of the transfer budget, wage room and FFP; a renewal notes that re-signing over the cap is allowed and counts toward the tax; a free agent's asks over the room are greyed "(over your cap room)". A full squad says "trade or release" in a world with trades.
- **Free Agents:** the cap summary (and, over the cap, the minimum-wage rule), free agency closed from the roster deadline to 1 July (a banner), "Only willing players within my cap room", the squad against 25 with whether the limit counts yet. `FreeAgentsView.wageRoom` is the free-agent room under a cap (it was Classic's wage room).
- **Finances & Facilities:** a Salary cap card in place of FFP (payroll against the cap with a bar, room or tax if the season ended today, the grace season, last season's tax paid or share received, what a club over the cap may still do); no transfer budget card and no Youth academy dial without academies; the dials' total reads "Together" (was "All four"). Revenue and expense labels for the luxury tax, its share and TV merit payments (merit showed as "merit" in Classic too).
- **League Finances:** under a cap, each club's payroll, cap and room this season (red when over), and a finished season's luxury tax paid and share received, in place of squad cost and FFP.
- **Browser check `superleague`:** in the re-signing period, Re-sign Players (open, the cap, next season), a willing player re-signed from it; Finances & Facilities and League Finances with the cap; on 1 July Free Agents with the cap and a free agent signed within the room.
- **Checks:** lint; 425 unit tests (the save's re-signing test extended: the page's players, cap and commitments checked against the squad, the cap's room, free-agent room and tax, Free Agents, both finance views and the squad's willingness); `pnpm build`; all 19 browser checks, 453 passes (Classic's 416 unchanged, the Super League's 37). In the full run `m6`'s "the ratings card stays inside the viewport" failed once and passed when run alone: the second such `m6` flake (the first in SL0, cause not captured); untouched by this chunk.

#### Chunk 6: the names file, How to play, three seasons (2026-10-28)
- **Names file** (SPEC §17.3, both worlds): New game's "Club names (optional)" takes a JSON file of the user's own, `{ "clubs": { "<club id>": { "name", "short", "abbr" } } }`, any field optional. "Download a template" gives every club of the chosen world by id with its names as they are (the game's own names), to edit. A file is checked as it's loaded (`src/common/clubNames.ts`: an unknown club or field, text that's empty, padded or too long, name 40 and short name 24 characters at most, an abbreviation of 2–4 capitals or digits, two clubs ending with one name or abbreviation; up to 8 reasons shown) and the club cards show the new names; the worker checks it again and renames the world's clubs before generating, so the save holds them and the world is otherwise the same (tested: players and fixtures identical, clubs differing only in names). Changing worlds drops the file. The game ships no such file.
- **How to play:** Starting names both worlds and the names file; a new "The Super League" part: tiers, promotion and the title play-off, no transfers/loans/academies, trades and the trading block with their dates, the draft and its lottery, picks as assets, re-signing, free agents, the 25-player limit, the salary cap with the tax and the grace season.
- **Browser check `superleague`, through three seasons:** a pick-for-pick trade (his first-rounder for a second-rounder; a trade taking a player back failed the 125% rule with Lyon over its cap after a big free-agent signing, as it should), then 2027/28 and 2028/29 played through the off-season each time (the draft to its end, re-signing, preseason); on 1 July 2028 free agents signed until the squad is over 25, and Play stops on the eve of the first match until he releases (one released); his Team History with three finished seasons. How to play's section. The names file at New game: the template (48 clubs), a bad file refused with its reason, a good one renaming Lyon on the cards and in the save. In this run Lyon stayed in Blue (9th, 3rd and out in the play-offs, 11th): promotion is luck, so the check doesn't require it.
- **Checks:** lint; 429 unit tests (new: the names file's reading and template in both worlds; a save with a names file); `pnpm build` (no real names in the bundle); the 19 browser checks: `superleague` 48 passes (11 new) and every Classic check passes, but `perf` failed its 60 s yardstick in three runs, each time with one season stalling for 60–100 s at random (season 2, 1, 9; the other seasons 4–5 s as always). Chunk 5's build, run the same way the same afternoon, stalled too (season 3, 66.6 s), so it's the machine at the time, not this chunk (in chunk 5's own run every season took 4–5 s). `edges` timed out once in the same full run and passed on its own.
- **SL7 acceptance:** T runs a Super League club through 3+ seasons in the UI (trade with picks, draft, re-sign, sign free agents, promotion or relegation, the cap): his local test. Every Classic browser check passes.

### SL8: Release (from 2026-10-29)
Plan (3 chunks): 1 every gate on both worlds, Classic against `main`, an older save opened by this build in a browser; 2 CHANGELOG 0.3.0 (everything since 0.2.0), version 0.3.0, then T's local test of the whole Super League; 3 after T's OK: push, PR, CI, the Cloudflare preview, merge, tag v0.3.0, production.

#### Chunk 1: the gates on both worlds (2026-10-29)
- **Every gate passes:** lint; 429 unit tests; `pnpm build` (no real names in the bundle; Vite's 500 KB chunk warning as since SL1); `pnpm generate --check` for Classic and the Super League; `pnpm calibrate --check`; `pnpm calibrate --world --check` (Classic) and `pnpm calibrate --world superLeague --check` (every gate; relegated clubs over their cap after grace 28 of 324, 8.6%; 75+ share +1.3 pts); all 19 browser checks in one run (`perf`'s worst season 4.9 s, ×4 ≈ 19.7 s: no stall this time; `superleague` 48 passes).
- **Classic plays exactly as `main`:** `pnpm calibrate --world --check` on `main` (50616fc, in a worktree) and on this branch print the same numbers for 3 worlds × 20 seasons, timing aside.
- **An older save in the browser:** `main`'s build (the bundle production serves, `index-zCCQNhzN.js`) started a Classic league as Merseyside Reds and played to 12 September; this branch's build, served on the same port so it opens the same IndexedDB, opened it (league DB v7 → v9) as Classic (Transfer Market, Youth Academy and Cups in the sidebar; no Draft or Trade) and played it through the season, the play-offs and promotion into 2027/28's preseason, its Transfer Market working, with no console errors.
- **Found, for T:** an older save keeps the 14 shared clubs' old names (they're in the save), but 13 crests now carry the new initials (the crest files are bundled by code): "Tyneside Magpies" (TYN) shows a crest reading "NEW".
- **CI:** also runs `pnpm generate --world superLeague --check` (2 s locally; the unit tests already covered it).

## Open issues
- `perf` (2026-10-28): one season in a run can stall for 60–100 s on T's Mac at times (seen on chunk 5's build too), failing the 60 s × 4 yardstick; rerun before suspecting a change, and look again if it persists.
- The UI bundle is past Vite's 500 KB chunk warning since SL1 (crests inlined): load crests as files, or split the bundle, if it matters.
- Firefox: T tests it by hand in M7 chunk 6 (Chrome: automated and T; Safari: T).
- For T: the academy incentive (academy players of 16+ play without counting toward the 25), and whether to add "tired" and "open bid" tags.
