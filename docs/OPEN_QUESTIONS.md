# Open Questions and Defaults

## A. Answered by T (Oct 13 2026)
| # | Question | Answer |
| --- | --- | --- |
| A1 | Championship play-offs: 4 teams or the real 2026/27 6-team format? | **Mirror the real 6-team format** (3rd–8th: one-off eliminators, two-legged semis, final) |
| A2 | GER1 has no relegation in the MVP (lowest simulated German tier)? | **Yes** |
| A3 | Game and repo name? | **soccer-sim-game** (display name "Soccer Sim Game") |
| A4 | OVR band labels? | **Keep ZenGM's**; internal labels, low priority |

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
