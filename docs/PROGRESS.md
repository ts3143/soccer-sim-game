# Build Progress

Claude Code updates this file at the end of each milestone.

| Milestone | Status | Notes |
| --- | --- | --- |
| M0 Scaffold and plumbing | Not started | |
| M1 Data, generation and new league | Not started | |
| M2 Match engine + calibration harness | Not started | |
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

## Open issues
_None yet._
