# Open Questions and Defaults

## A. Answered by T (Oct 13 2026)
| # | Question | Answer |
| --- | --- | --- |
| A1 | Championship play-offs: 4 teams or the real 2026/27 6-team format? | **Mirror the real 6-team format** (3rd–8th: one-off eliminators, two-legged semis, final) |
| A2 | GER1 has no relegation in the MVP (lowest simulated German tier)? | **Yes** |
| A3 | Game and repo name? | **soccer-sim-game** (display name "Soccer Sim Game") |
| A4 | OVR band labels? | **Keep ZenGM's**; internal labels, low priority |

## A2. Kickoff review, answered by T (Oct 14 2026)
All recorded in SPEC.md and logged in `PROGRESS.md` → Deviations from spec.
| # | Question | Answer |
| --- | --- | --- |
| 1 | "~1,800 senior players" vs 62 × 25 = 1,550 | All club players incl. academies; free agents on top |
| 2 | Clubs starting at the 25 cap | Start with 22–24 seniors; cap stays 25 |
| 3 | No default formation in club data | Seeded default from the 5 MVP presets; squad built around it; saved as starting tactics; `strength` measured in it |
| 4 | OVR rescaling per save? | Fixed per-position constants, fitted once in M1; refit only deliberately (v1.1) |
| 5 | `based_on` in the shipped build | Stripped from the build and saves; data file and repo unchanged |
| 6 | Where cash is stored | Current cash on the club; season-end snapshot in `clubSeasons` |
| 7 | Calibration targets vs style modifiers | Tune with modifiers neutral; check each league against target × modifier |
| 8 | Aerial counted twice at set pieces | Set Pieces = taker's delivery only; Aerial counts once |
| 9 | Development formula and decline | Dev on growth only, blends to neutral 23→27; decline = age × Medical; small mental minutes bonus at any age |
| 10 | GER1 "avoid relegation" target | Lowest target is "finish above the bottom 3" |
| 11 | German cup preliminary round in season 1 | The 4 lowest-`strength` clubs |
| 12 | Play-off dates | Midweek eliminators; semis weekend + midweek; final around 23–25 May |
| 13 | `minSeniorForMatch: 16` | If fewer than 16 seniors are fit, academy 16+ fill the bench (same rule as B6) |
| 14 | Stat-row retention vs pruning | Kept forever unless the player is pruned |
| 15 | Renewal deadline (no re-sign phase) | Keep as specified; renew by 31 Jan or he leaves 1 Jul; AI same; January inbox warning, deadline reminder, Squad expiry badges |

## A3. M2 planning, answered by T (Oct 14 2026)
| # | Question | Answer |
| --- | --- | --- |
| 1 | Substitution rule | 5 in normal time, at most 3 windows (half-time free); extra time adds a 6th sub and a 4th window; no replacement once used up |
| 2 | Season targets in M2? | Reported in M2 (round-robins with best XIs), gated in M3 with the real calendar |
| 3 | Where engine coefficients live | One code module, overridable by the calibration harness in memory; `data/config` keeps spec-level rules |
| 4 | How M2 is tested | A developer-only Match lab page; work in ~1 h chunks with a check-in after each |
| 5 | Who manages the user's club in a match | Simulated: the AI makes the in-game changes and picks the pre-match tactics. Watched: the user. No Auto option. |

## A4. M3 planning, answered by T (Oct 14 2026)
| # | Question | Answer |
| --- | --- | --- |
| 1 | Keeping squads full before M4 (no contracts or transfers yet) | Temporary upkeep: contracts roll over; each preseason AI clubs top up to 22 seniors from their academy, then from free agents. M4 replaces it. |
| 2 | Which 20-season world checks M3 gates | Player count, distinct champions, parity, season and development targets. Promoted-club survival and the finance checks move to M4. |
| 3 | League tie-breakers | Points, goal difference, goals scored, head-to-head points, head-to-head goal difference, seeded draw. Set per league in config so each league can change them. |
| 4 | Awards (in the spec, in no milestone) | Worked out and saved at season end in M3; pages in M5. |
| 5 | Injuries only in matches (ZenGM) or also in training? (asked Oct 15) | Also in training: same risk formula per day, tied to condition, the Medical dial and Injury Prone. |
| 6 | Player count rose ~35% before settling: the opening world was smaller than the youth flow settles at (asked Oct 15) | B: start the world in its settled shape. 9–12 academy players per club (aged 15–17) and ~190 just-released 18-year-olds in the free-agent pool; the ±10% stability check stays as written. |
| 7 | Development training base 0.4 caps a regular's growth at ~1.7× a benched player's; targets need more (asked Oct 15) | Lower the base to 0.2: dev = coaching × (0.2 + 0.8 × minutes × challenge) + performance. |
| 8 | Well-played 18–21 growth stuck at +3.8 (target 4–8), with world-shape side effects (asked Oct 15) | C: defer that check and the side effects (peak age, top-end inflation, mean drift) to M4, where transfers and loans change who gets minutes. The other 16 checks gate M3 and CI. |

## B. Defaults set during the kickoff review (marked `[DEFAULT]` in SPEC.md)
Build these as written unless T changes them.
1. **Hidden traits** (Injury Prone, Hothead) are generated and affect the sim from the MVP but are never shown until scouting arrives in v1.1.
2. **Transfer fees** are paid in cash up front in the MVP (installments later). For FFP they are amortised over contract length.
3. **Starting wage bills** put each club at ~50–65% squad cost ratio, so FFP headroom exists on day one.
4. **FFP penalty in the MVP:** warning, then a one-window transfer ban. Fines and points deductions later.
5. **Getting fired:** a "You're fired" screen with 1–3 job offers from lower-reputation clubs, or start a new league.
6. **Academy players aged 16+** can be picked for matchday squads (minutes count for development) without counting toward the 25.
7. **Loans in the MVP:** simulated clubs only; season-long or half-season; wage share 0/50/100%; no recall or option to buy; can't play against the parent club.
8. **Young free agents** (≤23) unsigned for 12 months leave the game, keeping the pool bounded.
9. **UI language:** English with British football terms (fixtures, defence, kit, centre-back).
10. **Performance budget:** one headless match < 5 ms; a full MVP season in-browser < 60 s; save < 100 MB after 10 seasons.
11. **Engine details added for completeness:** bench of 9; average match rating ~6.6; no away-goals rule; English cup entry (ENG2 round 1, ENG1 round 2); German cup preliminary round for the 4 lowest-placed clubs; GER1 winter break ~21 Dec–9 Jan; nationality mixes per league (`nationalities.json`); 20-season world-stability checks (`calibration_targets.json`).

## C. Settled during the build (no decision needed from T up front)
- Final formation list (MVP ships 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2).
- OVR weight tuning (hand-set now; regression refit against Value Added in v1.1).
- Exact formulas and coefficients (revenue, wages, market value, mood, attendance, injuries), tuned with the calibration harness.
- Club values sanity pass (strength, reputation, revenue in `clubs_2026_27.json`) once squads are generated, e.g. Man United equivalent at 70 and Spurs equivalent at 69 by design.

## D. Later
- Owner types (rich benefactor vs self-sustaining).
- Skill badges next to player names (undecided idea).
