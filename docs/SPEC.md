# Soccer Sim Game — Game Specification

This is the build spec for Claude Code. It consolidates every decision from the design doc (37 logged decisions, scoped Oct 13 2026) into one place, organised by system, with contradictions resolved. Updated Oct 14 2026 with the 15 kickoff-review decisions (logged in `PROGRESS.md` → Deviations from spec).

**Tags:** `[MVP]` ships in the first playable version. `[v1.1]` is the next layer. `[Later]` is roadmap. Untagged text applies to the MVP.
**Defaults:** items marked `[DEFAULT]` were not explicitly decided by T; they are sensible defaults listed in `OPEN_QUESTIONS.md` for confirmation. Build them as written unless told otherwise.

---

## 1. Vision and principles

A web-based soccer management sim in the mold of the ZenGM games (Basketball GM, Football GM, ZenGM Hockey). You are the GM of a club, building it across endless seasons.

- **Simple but deeply immersive.** Every system is legible at a glance; depth emerges from systems interacting (minutes ↔ development ↔ fatigue ↔ rotation ↔ finances).
- **Mirror ZenGM** in architecture, UX and conventions wherever that is sufficient. Do not copy ZenGM code: it is not open source.
- **Results come from players.** League "style" modifiers are small and act on inputs, never on results.
- **The AI plays by the user's rules** (same tactics levers, budgets, FFP, rotation logic).
- **Fictional but familiar.** Clubs mirror the real 2026/27 line-ups with fictional names on real cities. Real club names never appear in the UI.

---

## 2. World and competitions

### 2.1 MVP world `[MVP]`
- 3 leagues, 62 clubs (data: `data/clubs_2026_27.json`, config: `data/config/competitions_mvp.json`):
  - **ENG1** English top flight, 20 clubs, 38 rounds.
  - **ENG2** English second tier, 24 clubs, 46 rounds.
  - **GER1** German top flight, 18 clubs, 34 rounds.
- About 1,800 club players at start, academies included (22–24 senior + 4–6 academy per club), plus a seeded free-agent pool on top.
- **Promotion/relegation:** ENG1 bottom 3 go down to ENG2. ENG2 top 2 go up automatically; **3rd–8th play-offs** for the third place, mirroring the real 2026/27 format: one-off eliminators (5th hosts 8th, 6th hosts 7th), two-legged semi-finals (3rd vs lowest-seeded eliminator winner, 4th vs highest-seeded), single-match final at a neutral venue. Extra time and penalties where ties are level.
  - Play-off dates: eliminators in the first midweek slot after ENG2's final round; semi-final first legs the following weekend, second legs the midweek after; final around 23–25 May (the weekend slot nearest 24 May).
- **No relegation from the lowest simulated tier.** That means none from ENG2, and none from GER1 in the MVP because no German second tier exists yet.
- **Domestic cups:** one per country, single-leg knockout, extra time and penalties if level.
  - English cup: ENG2 clubs enter round 1 (24 → 12), ENG1 joins in round 2 (32 clubs), then last 16, quarter-finals, semis, final.
  - German cup: 4 lowest-placed GER1 clubs from last season play a preliminary round; then a 16-club knockout. In season 1 (no previous table) the 4 lowest-`strength` clubs play it.
- **No European competition in the MVP.** Cup winners receive prize money only.

### 2.2 Full world `[Later]`
- Top 5 European leagues plus their second tiers: England 20+24, Spain 20+22, Germany 18+18, Italy 20+20, France 18+18 = 10 leagues, 198 clubs, ~6,000 players, ~3,800 league matches per season.
- World size is a **setting at league creation**; disabled countries become guest clubs / Rest of World.
- Leagues are **data-driven config**: adding a country is adding config + club data, not code.
- Extra domestic cups (e.g. an English league cup), international breaks and national teams are later.

### 2.3 European competitions `[Later]`
- Champions League and Europa League equivalents (no Conference League), 32 clubs each, groups of 4 then two-legged knockouts, single final. A 36-team league phase may come later as a scheduling module.
- Playable countries: 20 Champions League places (4 each), 10 Europa League places (2 each, incl. cup winner).
- The remaining 34 places are filled from **~48 guest clubs**: fictional equivalents of clubs outside the playable leagues, full squads, playing only European matches. Guest domestic finish is generated from squad strength each year so qualification rotates. Guest players are Rest of World players. Disabled countries become guest clubs. Guest clubs are not manageable in v1.

---

## 3. Season, calendar and phases

### 3.1 Phase loop (July–June season)
| Phase | When | What happens |
| --- | --- | --- |
| Preseason | 1 July | Summer development update; youth intake; board sets expectations; budgets set; condition reset to 100%; summer window opens |
| Regular season (first half) | Aug–Dec | League + cup matches; summer window closes 31 Aug (deadline day) |
| Winter window | 1–31 Jan | Winter development update (1 Jan); transfers and renewals; GER1 pauses roughly 21 Dec–9 Jan, England plays through |
| Regular season (second half) | Feb–May | League run-in, play-offs, cup finals |
| End of season | late May–June | Awards; promotion/relegation; retirements; FFP check; contracts expire 30 June (those players become free agents) |

- **Renewals (user and AI) only during the summer and winter windows.** Final-year players are harder to re-sign. There is **no end-of-season re-sign phase**: a player whose contract ends 30 June must be renewed by 31 January, or he leaves as a free agent on 1 July. AI clubs follow the same rule.
  - Made visible to the user: an inbox warning when the January window opens, listing every player in his final six months; a reminder before deadline day; contract-expiry badges on the Squad page.
- **Free agents can be signed at any time**, inside or outside windows.
- **Board can sack the user mid-season** when confidence collapses (see 6.5).

### 3.2 Scheduling
- Real dates. **Two match slots per week:** weekend (Saturday) and midweek (Wednesday).
- League rounds use weekend slots; extra league rounds (ENG2 has 46) and cup ties use midweek slots.
- The sim jumps slot to slot (no daily ticks). Windows, deadline days, development updates and phase changes are **dated events** between slots.
- Fatigue recovery uses **real days elapsed** between a club's matches.
- **Play menu** (top bar, context-aware, ZenGM-style): Until next match · One week · Until window closes · Until end of season · plus phase steps when relevant ("Advance to preseason", "Start season", "Proceed to promotion/relegation", …).

---

## 4. Players

### 4.1 Bio
Name, nationality (+ optional second nationality, ~8%), birth date, birthplace, height and weight (display only), preferred foot (~75% right, weighted left at left-sided positions), primary and secondary positions, shirt number.

### 4.2 Ratings
- **22 ratings, 0–100.** The whole scale is used; a typical rating is around 50. Full list, codes and fixed storage order: `data/config/ratings_positions.json`.
- Groups: Physical (`hgt` fixed for life, `str`, `spd`, `jmp`, `end`), Mental (`oiq`, `diq`, `wrk`), Attacking (`fin`, `lsh`, `hdr`, `drb` incl. first touch), Passing (`spa`, `lpa`, `crs`), Defending (`tkl`, `ant` reading/cutting out passes), Specialist (`stp`, `pen`), Goalkeeping (`gkr`, `gko`, `gkh`).
- `stp` and `pen` carry near-zero OVR weight; the sim uses them directly for set-piece and penalty takers.
- **Ratings history:** all 22 stored at every development update (twice per season) as a compact fixed-order array.

### 4.3 Positions and OVR
- **10 position groups:** GK, CB, FB, WB, DM, CM, WM, AM, W, ST. Left/right variants share a formula; preferred foot affects fit (small wrong-foot penalty at FB/WB/WM; none for W, since inverted wingers are normal).
- **Every player has an OVR for all 10 groups.** Listed position = best one. Playing out of position uses that slot's OVR. No role sub-types.
- Starting weights (heavy 3 / medium 2 / light 1): `ratings_positions.json`. Hand-set now, refit by regression against Value Added in `[v1.1]`.
- **OVR scaling:** a position's OVR = the weighted mean of its ratings, mapped through **fixed per-position scaling constants** (fitted once in M1 so the player population matches the OVR bands; stored in `ratings_positions.json`). They are never recomputed per save and change only through a deliberate refit (planned for `[v1.1]` together with the weight refit).
- **OVR bands** (internal labels, ZenGM's): 85+ All-time great · 75+ MVP candidate · 65+ All-League candidate · 55+ Starter · 45+ Role player · below 45 Bad player.
- Stored: all position OVRs and POT, recomputed at each development update.

### 4.4 Potential (POT)
- Displayed POT = 75th-percentile OVR from simulated career arcs (ZenGM method), **using the player's expected minutes at his current club** (so benching a prospect visibly lowers his POT). Roughly 25% of players exceed their displayed POT.
- Use a cheap arc simulation (e.g. ~20 Monte Carlo arcs with the development formula) to respect the performance budget.
- **Hidden true ceiling** per player (see 5.3).

### 4.5 Traits
- **Mood traits (visible, negotiation only), mirroring ZenGM:** Fame (big club/market, playing time), Loyalty (stays put, dislikes teammates being sold), Money (pay first), Winning (team success; later incl. European football). Binary, fixed for life, 0–2 per player.
- **Hidden on-pitch traits:** Injury Prone (higher injury rate), Hothead (more fouls and cards).
  - `[DEFAULT]` In the MVP they are generated and affect the sim but are never shown. `[v1.1]` scouting reveals them gradually.
- All other on-pitch behaviour comes from ratings, not traits.

### 4.6 Mood
- ZenGM-style mood score from components: team success, hype, facilities, market size, playing time, loyalty (years at club). Traits change how much each component counts.
- Mood affects **only** contract negotiation: willingness to negotiate and the wage asked. No chemistry, no "upset players play worse".
- `[v1.1]` Squad role promises (starter / rotation / prospect): breaking one hurts mood and can trigger a transfer request.

---

## 5. Player development

### 5.1 Timing
Two progression updates per season: **summer (1 July)** and **winter (1 January)**. Each uses the minutes and match ratings from the half-season just played.

### 5.2 Age curve
- Growth to ~25–27, prime ~27–30, then decline that steepens past 30–32.
- Per-group timing: physical peaks earliest and falls first; technical peaks mid-career; mental (IQ, work rate, anticipation) grows to ~31–33; goalkeeping peaks ~29–33. Height is fixed.
- **Hidden curve type:** Normal 70% · Early bloomer 10% (peak ~2 years earlier, earlier decline) · Late bloomer 10% (peak ~2 years later) · Ageless 10% (decline delayed and slower).
- **Medium** random noise on every update (breakout seasons and stalls happen).

### 5.3 Development multiplier (growth only; full effect up to 23, blending to neutral by 27)
```
dev    = coaching × (0.4 + 0.6 × minutesFactor × challengeFactor) + performanceAdj
blend  = clamp((age − 23) / 4, 0, 1)          // 0 at 23 or younger, 1 at 27 or older
devEff = dev × (1 − blend) + 1.0 × blend      // blends linearly to neutral (1.0)

per rating, with a = ageCurve(group, age, curveType):
  growth  (a > 0):  Δrating = a × devEff × noise × gap / (gap + 8)   // gap = ceiling − OVR
  decline (a ≤ 0):  Δrating = a × medicalFactor × noise             // age × Medical dial; dev never applies
  mental group:     Δrating += mentalMinutesBonus × minutesFactor    // small, positive, at any age
```
- The dev multiplier applies to **growth only**. Decline is driven by **age × the Medical dial** (`medicalFactor` slightly below 1 for a high dial). Minutes, coaching and form can't speed decline up or slow it down, so a benched veteran never declines slower than a starter (unit-tested in M3).
- **mentalMinutesBonus** is a small tuned coefficient on the mental age-curve group (`oiq`, `diq`, `wrk`, `ant`).
- **coaching:** Coaching dial of the club where he actually plays (incl. loan clubs), mapped to 0.9–1.1.
- **minutesFactor:** share of available minutes in all competitions in the half-season, with diminishing returns. Zero minutes still gives the 0.4 training base.
- **challengeFactor:** compares the strength of the level he played at (minutes-weighted average team OVR of opponents/competitions) with his own OVR. Peaks when the level is at or slightly above his OVR; small when he is far too good for the level (blocks the weak-loan exploit) or badly out of his depth.
- **performanceAdj:** average match rating vs positional expectation, capped at ±0.15.
- **Academy players** (no matches) develop on coaching + Youth academy dial only.
- **Ceiling decay:** ages 19–23, if he plays under ~15% of available minutes in a season, his hidden ceiling drops 1–3 points (slightly randomised). This creates lost prospects.
- **Veterans:** minutes keep feeding mental ratings at any age (the mental minutes bonus above); decline is age-driven; the Medical dial slightly slows it.

### 5.4 Calibration targets
Well-played 18–21-year-olds gain roughly **+4 to +8 OVR per year**; benched ones 0 to +2; players 33+ lose roughly **4–7 per year**; most retire 33–37, goalkeepers later. Full targets: `data/config/calibration_targets.json`.

### 5.5 Retirement
Age-driven probability that rises sharply from 33 (later for GKs), higher for low-OVR and unsigned players. Older free agents unsigned for a full season retire.

---

## 6. Clubs, finances and board

### 6.1 Club data
Fixed identity from `data/clubs_2026_27.json`: name, short name, 3-letter abbreviation, city, country, capacity, colors (primary/secondary/tertiary), market size (1–100), reputation (1–100), revenue (scaled €M projection for 2026/27), strength (target starting-XI OVR), crest (generated SVG). The `based_on` field is a **dev reference only and must never appear in the UI.** It is stripped at build time: it never ships in the app bundle and is never written to a save. The data file and the repo keep it.

Dynamic per club: hype (fast-moving, recent results), reputation (slow-moving), cash, budget dials, ticket price, tactics, board confidence.

### 6.2 Revenue
- **Matchday:** attendance × one ticket price per season (user-set; AI auto). Attendance is capped by capacity and driven by hype, market size, opponent/competition size and ticket price.
- **Broadcast:** pool by league tier; equal share + merit by finishing position. Largest and most predictable stream.
- **Prize money:** cup rounds (MVP). `[Later]` European participation, wins and progress.
- **Commercial:** sponsorship and merchandise from reputation, market size, success and star players.
- **Player sales:** fees received (profit counts toward FFP).
- Money flow: matchday per home match, broadcast monthly, prize money as earned. All money in **whole euros**; wages quoted **per year**.
- Use each club's `revenue_m` as the season-1 anchor; scale the formulas so clubs land near it. Revenue varies hugely by tier (top flight ~€100M–€860M; second tier ~€20M–€160M, highest for recently relegated clubs).

### 6.3 Expenses and budgets
- **Wages** (largest cost) and **transfer fees** (`[DEFAULT]` cash paid up front in the MVP; installments later; amortised over contract length for FFP).
- **Budget dials** (ZenGM-style expense levels): `[MVP]` Coaching (development), Youth academy (intake count/quality), Medical (injury rate and recovery, slows decline), Facilities (slow-moving; attendance and player appeal). `[v1.1]` Scouting (rating accuracy, reveals hidden traits). Dial cost scales with club revenue.
- **Transfer budget** auto-derived from cash, projected profit and FFP headroom; **wage room** = what the FFP ratio allows. One control shifts money between the transfer budget and wages. Both numbers ("Transfer budget €X", "Wage room €Y") show on transfer and contract screens.
- **Starting wage bills** `[DEFAULT]`: generate squads so each club starts at roughly 50–65% squad cost ratio, leaving FFP headroom.

### 6.4 Financial rules (FFP)
- **Single squad cost ratio:** wages + amortised transfer fees ≤ **70% of revenue** (profit on player sales counts as revenue), checked at season end. AI clubs follow the same rule.
- UI: one gauge on the finances page + € headroom on transfer and contract screens.
- Penalties escalate: fine → transfer ban → points deduction (`[Later]` or European ban). `[DEFAULT]` MVP implements **warning → one-window transfer ban** only.
- Negative cash freezes transfers but is not game over.

### 6.5 Board
- Preseason **expectation** from squad strength vs league: ENG1 = title / top 4 / mid-table / avoid relegation; GER1 = title / top 4 / mid-table / finish above the bottom 3 (GER1 has no relegation in the MVP); ENG2 = promotion / play-offs / mid-table.
- **Board confidence** = results vs expectation + finances + hype. Too low → fired, including mid-season.
- `[DEFAULT]` When fired: a "You're fired" screen offering 1–3 jobs at clubs with lower reputation (fictional vacancies), or start a new league. No other staff entities exist in the MVP.
- `[Later]` Owner types (rich benefactor vs self-sustaining).
- No parachute payments.

---

## 7. Squad building

### 7.1 Squad rules
- Max **25 senior players**; academy unlimited. Academy = players aged ≤18 who have not been promoted; by 19 they must be promoted, loaned or released.
- Clubs start with **22–24 seniors** (cap stays 25), so there is room to sign in the first window.
- `[DEFAULT]` Academy players aged 16+ may be picked for a matchday squad (their minutes count for development) without counting toward the 25.
- If fewer than **16 seniors** are fit (`minSeniorForMatch`), academy players aged 16+ fill the bench. Same rule as the default above.
- Matchday squad: 11 starters + up to 9 substitutes.
- **Substitutions** follow the real rule: up to **5 in normal time, in at most 3 windows** during play (subs at half-time don't use a window). **Extra time adds a 6th sub and a 4th window** (subs just before extra time and at its half-time don't use a window). Once the subs or windows are used up, an injured player can't be replaced and his team plays on with 10. No concussion substitutes.

### 7.2 Youth academy (replaces the draft)
- Every club gets **3–6 youths aged 15–16 each preseason**; count and quality scale with the Youth academy dial and reputation.
- Nationality mostly the club's country; bigger clubs pull in a larger foreign share (`data/config/nationalities.json`).
- 2–3 years of academy development (Coaching + Youth dials, no minutes needed).
- At 17–18: promote (first pro contract, 3 years), loan, or release to the free-agent pool.
- Roughly 1 wonderkid (POT 75+) per league per season.
- All clubs, including AI, run academies.

### 7.3 Transfers
- **Cash only**, in two steps: agree a fee with the selling club, then personal terms with the player (mood and negotiation apply).
- **Windows:** summer (1 Jul–31 Aug) and winter (1–31 Jan), each with a deadline day.
- **AI buying:** needs-based (fills its weakest XI slots) within transfer budget and FFP headroom.
- **AI strategy:** contending / developing / selling. A contender won't sell a starter mid-season without a premium; a seller takes fair offers.
- **AI valuation:** market value × importance to its XI × years left on contract (one year left = cheap). **Nonlinear value** so two average players never equal one star (prevents exploits).
- **AI-to-AI transfers** every window; AI clubs bid for the user's players (arrives in the Inbox).
- **Market value (€)** derived from OVR, POT, age, contract years left and form; scaled by league level. Shown on profiles and used for AI pricing.
- `[MVP]` Market = simulated clubs + free agents. `[v1.1]` Rest of World market.

### 7.4 Loans
- Parent club pays a share of the wage; loan minutes count toward development (with the loan club's coaching).
- `[DEFAULT]` MVP loans: within simulated clubs only; season-long or half-season (summer → January, or January → end of season); wage share 0 / 50 / 100%; no recall, no option to buy; a loanee cannot play against his parent club.

### 7.5 Free agents
- One pool: out-of-contract players, released players and released youths, **seeded with extra unattached players at league creation**.
- No fee, higher wage asks that drop the longer they stay unsigned (ZenGM-style).
- Older free agents unsigned for a full season retire. `[DEFAULT]` Young free agents (≤23) unsigned for 12 months leave the game, so the pool stays bounded.
- `[v1.1]` Pre-contracts: final-year players can agree to join for free next summer.

### 7.6 Contracts
- Length 1–5 years; first pro contract 3 years. Wages per year. No hard max wage (FFP and budget limit spending). No release clauses for now.
- ZenGM-style negotiation: the player asks a wage per contract length, adjusted by mood; the user picks a length/wage or walks away. One modal for renewals, transfers and free agents.
- Renewals only in the summer and winter windows; expiry 30 June. A player in his final year must be renewed by 31 January or he leaves on 1 July (see 3.1).

### 7.7 Rest of World `[v1.1]`
- RoW = every player outside the simulated leagues. Pool of ~300–500 players across regions, each at a fictional club with a league-level tag (strong/mid/weak) that sets development in place of minutes.
- Refreshed each season (young talents spawn, players age and retire; size stable). RoW clubs are pure sellers (fee ≥ market value × regional factor). Ratings fuzzier unless Scouting is high; season stats generated from ratings. AI clubs also buy from RoW.
- Players 32+ or unhappy can move to RoW for money and may return later. (In the MVP, these players simply retire or stay in the free-agent pool.)

---

## 8. Match engine

### 8.1 Model
- **Possession/event-based**, mirroring ZenGM. Each possession runs a chain: **start zone → build-up → progression into the final third → chance creation → shot (xG) → outcome** (goal, save, miss, block, corner, foul, turnover). Each possession advances the game clock.
- **Team ratings set step probabilities; player ratings decide who acts** (who passes, presses, shoots, tackles, fouls).
- **Resumable from day one:** the engine runs possession by possession and can pause for input, then continue. Simmed matches run straight through; watched matches pause.
- All randomness through the **seeded RNG**.
- Every shot carries an xG value (zone, shot type such as header/long shot/penalty, pressure, shooter ratings).

### 8.2 Team ratings (7)
Computed from the starting XI by slot (config: `formations_tactics.json`): Passing, Attack (incl. finishing), Pressing, Defence, Aerial, Set Pieces, Goalkeeping.

| Chain step | Attack vs defence |
| --- | --- |
| Build-up | Passing vs Pressing |
| Progression | Passing vs Defence |
| Chance creation | Attack vs Defence |
| Shot outcome | Attack vs Goalkeeping |
| Crosses and set pieces | Aerial + Set Pieces vs Aerial |

- **Set Pieces** = the designated taker's delivery quality (`stp`) only. Aerial ability counts once in the set-piece matchup, through the Aerial rating.
- **Team OVR** = regression of the seven ratings onto goal difference, shown 0–100. Until enough sim data exists, use a hand-weighted placeholder; club `strength` in the club data means the mean slot OVR of the club's best XI in its default formation (see 8.3).
- Home advantage is a small engine coefficient tuned to the calibration targets.

### 8.3 Tactics
- **Formations:** presets only. MVP: 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2. Defined for later: 4-1-4-1, 3-4-3, 5-4-1. Each preset defines 11 slots with position groups and sides.
- **Default formation:** at league creation each club gets a seeded default formation from the 5 MVP presets (selection weights in `formations_tactics.json`). Its squad is generated around it, it is saved as the club's starting tactics, and the club's `strength` is measured in it.
- **Three sliders, 5 steps each (−2…+2):** Mentality (defensive ↔ attacking), Pressing intensity, Directness (short ↔ direct). Each has a trade-off (see config). No defensive-line or width sliders. Team ratings update live as sliders move.
- AI clubs choose formation and sliders to suit their squad. **Who decides is set by whether the user watches** (no Auto option): for a match the user watches, he sets his club's pre-match tactics; for a simulated match, the AI picks them for his club too, with the same logic as for AI clubs.
- Coaching is a budget dial affecting development only; tactics are the user's.

### 8.4 Fatigue
- **In-match energy** starts at the player's current condition and drains per minute based on endurance, work rate and the pressing slider. Low energy lowers effective ratings: physical ratings most, technical about half as much.
  ```
  effective = rating × (0.85 + 0.15 × energy)   // physical; technical ~half the effect
  ```
- **Condition (0–100%)** between matches drops with minutes played and energy spent; recovers per rest day (faster with endurance and Medical dial, slower with age). Reset to 100% in preseason.
- Below ~75% condition, **injury risk rises sharply.**
  ```
  injury_risk = base × (1 + k × (1 − condition)) × injuryProne × medicalFactor
  ```
- No match sharpness.
- Energy is match-only and never saved; condition is saved.

### 8.5 Substitutions and in-game AI
- Substitutions per §7.1 (5 in 3 windows; +1 sub and +1 window in extra time). The AI bundles changes into windows, e.g. a double change around 60–65', another around 75', keeping the last window for an injury or a late chase.
- **In-game changes:** in a simulated match the AI makes them for every club, the user's included; in a match the user watches, the user makes them for his club (no Auto option). AI in-game rules: protect a late lead, chase the game when behind, fatigue subs around minutes 60–75, replace injured players.

### 8.6 Knockouts
Single-leg cup ties, play-off eliminators and play-off finals: extra time (2 × 15 min, with energy carrying over) then penalties (`pen` vs GK `gko`/`gkr`). Two-legged ties: aggregate, then extra time and penalties in the second leg (no away-goals rule).

### 8.7 Match ratings
- 0–10 scale built from event contributions (goals, assists, key passes, tackles, interceptions, saves, errors, cards) relative to positional expectation. Target average ~6.6, typical range 5.0–8.5.
- Feed: form display, development (`performanceAdj`), awards.

### 8.8 League style modifiers
Small per-league coefficients on inputs only (`competitions_mvp.json`): ENG2 ~10–15% fewer goals (chance quality), slightly more fouls, more direct/aerial AI tactics; GER1 slightly higher-scoring; ENG1 slightly fewer fouls.
- **Calibration:** the engine is tuned with all style modifiers neutral (1.0). Each league is then checked against target × its modifier (mapping in `calibration_targets.json` → `leagueChecks`). ENG2 landing ~2.5 goals per match is correct.

---

## 9. Rotation and lineup AI
- AI picks its XI by **OVR × condition**, with a **mid-term view**: it weighs match importance (late cup rounds, key league games, title/relegation/promotion stakes) and upcoming fixture congestion rather than optimising each match.
- Simulated matches use the same logic for the user's club. For a match he watches, the user picks the lineup; his picks show condition and an injury-risk warning.
- Calibration target: top-club starters play ~75–85% of available minutes.

---

## 10. Stats, awards and history

### 10.1 Per player per match
Minutes; goals, assists; shots, shots on target; passes attempted/completed, key passes, progressive passes, crosses; tackles, interceptions, clearances, blocks, aerial duels won; dribbles attempted/completed; fouls, cards; GK saves, goals conceded, clean sheets; xG, xA; match rating.

### 10.2 Per team per match
Possession, shots, shots on target, xG, corners, passes, fouls, cards.

### 10.3 Season rows
Per player per club per competition per season (ZenGM-style). Per-90 values derived. Advanced stats (Value Added, on-pitch xG difference per 90, PPDA) are `[v1.1]`.

### 10.4 Match records
Box score + scoring summary + key events (goals with assister, cards, subs, injuries) + basic team stats. **No play-by-play is saved:** the live feed exists only on screen while watching.

### 10.5 Awards and history `[MVP]`
Player of the Year, Golden Boot, Team of the Season (per league); league champions, promotions/relegations, cup winners; club history; player career stats; transactions log.

---

## 11. UI and screens

Mirror ZenGM's layout: a **top-bar Play button** (sim options + phase steps) and a **sidebar** of sections. Every TEAM page has a **team dropdown** (view any club). Tables are sortable and filterable, paginated where large. Desktop web first. UI language: English with British football terminology `[DEFAULT]` (fixtures, defence, kit, transfer window, centre-back).

| Section | Screens `[MVP]` |
| --- | --- |
| General | Dashboard (next match, form, position, board confidence, condition alerts, inbox preview), Inbox (board messages, incoming bids, injuries, window deadlines, contract expiries) |
| League / World | Standings (zones for promotion, play-offs, relegation), Cups (own page, brackets), Weekly Schedule, Finances/Facilities overview of all clubs, History (champions, cup winners, awards, top scorers), Power Rankings, Transactions |
| Team | Squad, Tactics, Schedule (Sim game / Watch live), Box score / Game log, Finances/Facilities, History, Youth Academy |
| Players | Free Agents, Transfer Market (tabs: Search, Your listed players, Incoming offers, Loans), Player profile, Contract negotiation (modal) |
| Stats | League Leaders, Player Ratings, Player Stats, Team Stats, Injuries |
| Tools | Settings, Manage Leagues (create, switch, delete saves) |

Screen details:
- **Squad:** contract-expiry badges on players whose contracts end this 30 June (see 3.1).
- **Tactics:** formation dropdown preloads the 11 slots into a table; players are drag-and-drop ordered into slots and bench (ZenGM-style); slot OVR shown per player; the 3 sliders; live team ratings. No Auto toggle: these tactics apply to the matches the user watches. No pitch view.
- **Watch live:** before kick-off, temporary one-match changes to the saved lineup (incl. one-click Auto rotation). During: live text feed, score and clock, live stats, energy bars, subs, sliders, pause button; pausing opens an adjustment screen; half-time screen.
- **Player profile:** bio, ratings table + **radar chart** (8 grouped axes, see config), OVR/POT history chart, career stats, contract, mood (with ZenGM-style breakdown popup), condition and injury, transfer history.
- **Finances (own club):** revenue/expense breakdown, cash over seasons, FFP gauge, budget dials, ticket price, transfer/wage budgets and shift control.
- **New league screen:** pick your club (any of the 62).
- `[v1.1]` Watch List, Compare Players (overlaid radar charts), advanced-stats views.
- `[Later]` Dark mode, Manage Teams, export/import, God Mode.

---

## 12. Data model and storage

- **One IndexedDB database per league save** + an **in-memory cache** for current-season data (ZenGM pattern). IndexedDB is hit only for uncommon reads (past seasons).
- Fixed data (`data/`) ships as JSON and is copied into each new save, minus `based_on` (stripped at build time; see 6.1).

| Store | Holds |
| --- | --- |
| `meta` | Season, phase, current date, user club, settings, world-size config, league modifiers, RNG state |
| `competitions` | Leagues, cups, play-offs: format, tiers, promotion/relegation links, prize money |
| `clubs` | Fixed identity (without `based_on`) + current tactics (starting from the default formation), budget dials, ticket price, **current cash** |
| `clubSeasons` | Per club per season: league, finish, W/D/L, revenue/expense breakdown, **season-end cash snapshot**, hype, reputation, board expectation/confidence, FFP ratio |
| `players` | Bio; ratings history (array per development update); position OVRs + POT; hidden ceiling, curve type, hidden traits; mood traits; contract; status (club, academy, loan, free agent, retired); injury; condition; transfer history |
| `playerStats` | Per player per club per competition per season |
| `fixtures` | Date, slot, competition, round, home/away, result reference |
| `matches` | Box score, scoring summary, key events, team stats, player match ratings |
| `offers` | Live bids, loan offers, negotiations, deadlines |
| `transactions` | Permanent log (transfers, loans, signings, renewals, releases, academy promotions, retirements) with name snapshots |
| `inbox` | Messages to the user |
| `awards` | Season awards, champions, cup winners, records (with name snapshots) |

- **Stored:** position OVRs + POT. **Derived on the fly:** team ratings/OVR, standings, per-90s, market value. **Match-only:** in-match energy.
- **Retention:** full match records kept **2 seasons** in the MVP (setting), except the user's club matches, kept forever. The default scales down with world size later (e.g. current season only for other clubs once all 10 leagues are on). Season stat rows are kept forever unless the player is pruned (below).
- **Pruning:** retired players with no awards, low peak OVR and no notable spell at the user's club are deleted a few seasons after retiring, with their stat rows; transactions and awards keep name snapshots.
- Conventions: integer IDs; money in whole € per year; ISO date strings; every season-scoped row tagged with `season`.
- Saves are **local only** (no accounts, no cloud sync). `[Later]` export/import.

---

## 13. Tech architecture

- **Single-page app running fully in the browser.** Game core in a **Shared Worker** (Web Worker fallback). Each tab runs UI only and talks to the worker through **typed calls** (ZenGM's `toWorker`/`toUI` pattern). The UI never touches IndexedDB directly.
- **Stack:** TypeScript (strict), React, Bootstrap 5, Vite, pnpm, Vitest, ESLint (+ Prettier).
- **Folders:** `src/ui`, `src/worker` (core: engine, development, finances, transfers, AI, schedule, db), `src/common` (shared types, schema, constants), `data/` (clubs, crests, config, name files), `tools/` (calibration harness, generators).
- **Seeded RNG** for all randomness; any simulation can be replayed from a seed.
- **Calibration harness** in `tools/` sims 20+ seasons headlessly (Node) against `calibration_targets.json`.
- **Hosting:** public GitHub repo; Cloudflare Pages (free), auto-deploy on push with branch previews; SPA routing. Total running cost €0.
- `[Later]` Service worker for offline/installable app.
- **Licensing:** mirror ZenGM's architecture and patterns only. Write all code fresh.

---

## 14. Calibration and performance
- All engine, development, finance and stability targets: `data/config/calibration_targets.json`. The harness is the gate for Milestones 2–4.
- Engine targets are met with all league style modifiers neutral; each league is then checked against target × its modifier (see 8.8).
- Performance budget `[DEFAULT]`: one headless match < 5 ms; a full MVP season in-browser < 60 s on a mid-range laptop including season processing; save < 100 MB after 10 seasons.

---

## 15. Roadmap summary
- **v1.1:** Rest of World market and exits; scouting fog (Scouting dial, fuzzy displayed ratings, reveal hidden traits); squad role promises; pre-contracts; advanced stats (Value Added, on-pitch xG difference, PPDA) then OVR weight and scaling refit; Watch List; Compare Players.
- **Later:** all 10 leagues + world-size setting; European competitions + guest clubs; owner types; God Mode; export/import; custom rosters; Manage Teams; dark mode; more formations; 36-team league phase; extra domestic cups; international breaks and national teams; offline (service worker).
- **Ideas, undecided:** ZenGM-style skill badges next to player names (no gameplay effect).

---

## 16. Glossary
- **OVR:** overall rating for a position. **POT:** displayed potential. **Ceiling:** hidden true potential.
- **Condition:** between-match freshness (saved). **Energy:** in-match freshness (not saved).
- **Squad cost ratio:** (wages + amortised fees) / revenue; FFP cap 70%.
- **Window:** transfer and renewal period (summer, winter).
- **Slot:** a position in a formation (group + side).
