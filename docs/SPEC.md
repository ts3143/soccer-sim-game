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
- About 2,100 club players at start, academies included: 22–24 seniors and 9–12 academy players (aged 15–17) per club, the size the yearly youth intake settles at (T, 2026-10-15). On top, a seeded free-agent pool of about 310: 120 experienced players and about 190 18-year-olds just released by academies.
- **Promotion/relegation:** ENG1 bottom 3 go down to ENG2. ENG2 top 2 go up automatically; **3rd–8th play-offs** for the third place, mirroring the real 2026/27 format: one-off eliminators (5th hosts 8th, 6th hosts 7th), two-legged semi-finals (3rd vs lowest-seeded eliminator winner, 4th vs highest-seeded), single-match final at a neutral venue. Extra time and penalties where ties are level.
  - Play-off dates: eliminators in the first midweek slot after ENG2's final round; semi-final first legs the following weekend, second legs the midweek after; final around 23–25 May (the weekend slot nearest 24 May).
- **League tables** are ordered by points, then goal difference, goals scored, head-to-head points, head-to-head goal difference, and finally a seeded draw. Each league sets its own tie-breaker order in config (`tieBreakers` in `competitions_mvp.json`), so a league can use different rules later.
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
- **Free agents can be signed at any time**, inside or outside windows (by the user; AI clubs sign them on their market days, which fall inside the windows — T, 2026-10-19).
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
Name, nationality (+ optional second nationality, ~8%), birth date, birthplace (drawn from where real footballers of his nationality were born, `data/names`; about half of a club's academy players from the club's own country are born in the club's city instead; shown in the profile's bio; T, 2026-10-25), height and weight (display only), preferred foot (~75% right, weighted left at left-sided positions), primary and secondary positions, shirt number.

### 4.2 Ratings
- **22 ratings, 0–100.** The whole scale is used; a typical rating is around 50. Full list, codes and fixed storage order: `data/config/ratings_positions.json`.
- Display groups (FM style, T, 2026-10-23; the same split as the age curves in 5.3): Technical (`fin`, `lsh`, `hdr`, `drb` incl. first touch, `spa`, `lpa`, `crs`, `tkl`), Mental (`oiq`, `diq`, `wrk`, `ant` reading/cutting out passes), Physical (`hgt` fixed for life, `str`, `spd`, `jmp`, `end`), Set pieces (`stp`, `pen`), Goalkeeping (`gkr`, `gko`, `gkh`).
- **Ratings layout** (T, 2026-10-23), the same in the ratings card and on the profile: three columns, Technical | Mental + Set pieces | Physical + Goalkeeping, full names, a fixed order. Rows that count most towards the OVR of the position shown are highlighted: heavy-weight (3) "key", medium-weight (2) "useful", the rest plain. Only the number carries the red-to-green scale. A legend names the position.
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
- Displayed POT = 75th-percentile OVR from simulated career arcs (ZenGM method), **using the player's expected minutes at his current club** (so benching a prospect visibly lowers his POT). Roughly 20% of players exceed their displayed POT (T, 2026-10-19; was 25%: released and stalled young players fall short of the forecast).
- Use a cheap arc simulation (e.g. ~20 Monte Carlo arcs with the development formula) to respect the performance budget.
- **Hidden true ceiling** per player (see 5.3).

### 4.5 Traits
- **Mood traits (visible, negotiation only), mirroring ZenGM:** Fame (big club/market, playing time), Loyalty (stays put, dislikes teammates being sold), Money (pay first), Winning (team success; later incl. European football). Binary, fixed for life, 0–2 per player.
- **Hidden on-pitch traits:** Injury Prone (higher injury rate), Hothead (more fouls and cards).
  - `[DEFAULT]` In the MVP they are generated and affect the sim but are never shown. `[v1.1]` scouting reveals them gradually.
- All other on-pitch behaviour comes from ratings, not traits.

### 4.6 Mood
- ZenGM-style mood score from components: team success, hype, facilities, market size, playing time, loyalty (years at club). Traits change how much each component counts.
  - **Ambition** (T, 2026-10-18), kept very subtle: a player clearly better than his club (more than about 6 OVR above its best-XI level, counting part of a young player's potential) is slightly less happy there, more so with Fame or Winning. It counts only as far as stronger clubs exist, and it must not drain talent to the big clubs.
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
dev    = coaching × (0.2 + 0.8 × minutesFactor × challengeFactor) + performanceAdj
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
- **minutesFactor:** share of available minutes in all competitions in the half-season, with diminishing returns. Zero minutes still gives the 0.2 training base (T, 2026-10-15; was 0.4, which held a young regular's growth to about 1.7× a benched player's, too little for the +4–8 vs 0–2 targets).
- **challengeFactor:** compares the strength of the level he played at (minutes-weighted average team OVR of opponents/competitions) with his own OVR. Peaks when the level is at or slightly above his OVR; small when he is far too good for the level (blocks the weak-loan exploit) or badly out of his depth.
- **performanceAdj:** average match rating vs positional expectation (the ratings' centre: 6.9, keepers 6.8), 0.12 per rating point, capped at ±0.15.
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
  - The user sets his price in preseason; it locks after his club's first home match of the season. "Auto" uses the AI's price (T, 2026-10-19).
- **Broadcast:** pool by league tier; equal share + merit by finishing position. Largest and most predictable stream. Each league's pool, and its equal and merit shares, are set per league in config (`competitions_mvp.json`, T 2026-10-16).
- **Prize money:** cup rounds (MVP), set per cup and round in config. `[Later]` European participation, wins and progress.
- **Commercial:** sponsorship and merchandise from reputation, market size, success and star players.
- **Player sales:** fees received (profit counts toward FFP).
- Money flow: matchday per home match, broadcast monthly, prize money as earned. All money in **whole euros**; wages quoted **per year**.
- Use each club's `revenue_m` as the season-1 anchor; scale the formulas so clubs land near it. Revenue varies hugely by tier (top flight ~€100M–€860M; second tier ~€20M–€160M, highest for recently relegated clubs).

### 6.3 Expenses and budgets
- **Wages** (largest cost) and **transfer fees** (`[DEFAULT]` cash paid up front in the MVP; installments later; amortised over contract length for FFP).
- **Budget dials** (ZenGM-style expense levels): `[MVP]` Coaching (development), Youth academy (intake count/quality), Medical (injury rate and recovery, slows decline), Facilities (slow-moving; attendance and player appeal). `[v1.1]` Scouting (rating accuracy, reveals hidden traits). Dial cost scales with club revenue.
- **Transfer budget** auto-derived from cash, projected profit and FFP headroom; **wage room** = what the FFP ratio allows. One control shifts money between the transfer budget and wages. Both numbers ("Transfer budget €X", "Wage room €Y") show on transfer and contract screens.
- **Starting wage bills** `[DEFAULT]`: generate squads so each club starts at roughly 50–65% squad cost ratio, leaving FFP headroom. About 30% of that opening squad cost is amortisation of notional past transfer fees, and the rest is wages (T, 2026-10-16). This keeps individual wages near real-world levels.

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
- **Substitutions** follow the real rule: up to **5 in normal time, in at most 3 windows** during play (subs at half-time don't use a window). **Extra time adds a 6th sub and a 4th window** (subs just before extra time and at its half-time don't use a window). Once the subs or windows are used up, an injured player can't be replaced and his team plays on with 10. No concussion substitutes. **Moving players between positions is free** at any pause (T, 2026-10-21), including into a sent-off player's empty slot, leaving another slot empty instead; a sent-off player can't be replaced. A substitute is judged (rated) against the slot he ends up in.

### 7.2 Youth academy (replaces the draft)
- Every club gets **3–6 youths aged 15–16 each preseason**; count and quality scale with the Youth academy dial and reputation.
- Nationality mostly the club's country; bigger clubs pull in a larger foreign share (`data/config/nationalities.json`).
- 2–3 years of academy development (Coaching + Youth dials, no minutes needed).
- At 17–18: promote (first pro contract, 3 years), loan, or release to the free-agent pool.
  - The user decides for his own academy on the Youth Academy page. A player aged 18+ on 1 July whom he hasn't decided on gets the AI clubs' rule (promoted if good enough and there's room, otherwise released), with an inbox reminder in May (T, 2026-10-19).
- Roughly 1 wonderkid (POT 75+) per league per season.
- All clubs, including AI, run academies.

### 7.3 Transfers
- **Cash only**, in two steps: agree a fee with the selling club, then personal terms with the player (mood and negotiation apply).
- **Windows:** summer (1 Jul–31 Aug) and winter (1–31 Jan), each with a deadline day.
- **AI buying:** needs-based (fills its weakest XI slots) within transfer budget and FFP headroom.
- **AI strategy:** contending / developing / selling. A contender won't sell a starter mid-season without a premium; a seller takes fair offers.
- **AI valuation:** market value × importance to its XI × years left on contract (one year left = cheap). **Nonlinear value** so two average players never equal one star (prevents exploits).
- **AI-to-AI transfers** every window; AI clubs bid for the user's players (arrives in the Inbox, answered in the message or on the Transfer Market).
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
- **Releasing a player** (user, as ZenGM; T, 2026-10-19): he joins the free-agent pool at once, and the club keeps paying his wages monthly until the contract would have ended. They count toward the squad cost ratio.
  - Counting the years (T, 2026-10-18): a summer deal counts the current season as its first year; a January deal's years start next season, with the half season left on top ("two and a half years"). A renewal must run past the current contract.
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
- **Form on the day** (T, 2026-10-19): each team's ratings move by a small random amount for the whole match (seeded), so a weaker side has its good days. Its spread is an engine coefficient tuned with the calibration targets (parity: top six losing to bottom six).

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
- Injuries happen **in matches and in training** between matches (T, 2026-10-15). Training injuries use the same formula once per day, with that day's condition, from 1 July to the season's last match. The training rate is tuned so squads average about 3 injured players at once.
- No match sharpness.
- Energy is match-only and never saved; condition is saved.

### 8.5 Substitutions and in-game AI
- Substitutions per §7.1 (5 in 3 windows; +1 sub and +1 window in extra time). The AI bundles changes into windows, e.g. a double change around 60–65', another around 75', keeping the last window for an injury or a late chase.
- **In-game changes:** in a simulated match the AI makes them for every club, the user's included; in a match the user watches, the user makes them for his club (no Auto option). AI in-game rules: protect a late lead, chase the game when behind, fatigue subs around minutes 60–75, replace injured players.

### 8.6 Knockouts
Single-leg cup ties, play-off eliminators and play-off finals: extra time (2 × 15 min, with energy carrying over) then penalties (`pen` vs GK `gko`/`gkr`). Two-legged ties: aggregate, then extra time and penalties in the second leg (no away-goals rule).

### 8.7 Match ratings
- 0–10 scale built from event contributions (goals, assists, key passes, tackles, interceptions, blocks, passing, dribbles, cards, the result) relative to what's normal for the position. Average **~6.9** (T, 2026-10-21; was 6.6): a full game averages about 6.95, everyone who played about 6.85. Short cameos are pulled toward 6.9.
- Tackles, interceptions and key passes count for more than goals alone suggest, so a midfielder who runs a game can reach about 8 without scoring or assisting. Typical full games: one goal ~8.1, two ~8.9, a hat-trick ~9.6.
- **Soft top:** above 8.4 a rating climbs at half speed, so 9+ is about 1% of full games and a 10 comes about once in 100+ matches.
- **Keepers** are rated mainly on **goals prevented**: the post-shot xG of the on-target shots they faced (what an average keeper would concede from them) minus the goals they conceded, plus a small knock per goal conceded and the result. Big saves count through it. They average a little lower, **~6.8** (T, 2026-10-21), and swing less than outfielders. Typical full games: a clean sheet ~7.5 (7.2–7.9), a clean sheet with big saves ~7.9, four or more conceded without being at fault ~6.2, clear mistakes ~5. **Soft bottom:** below 5.0 a keeper's rating falls at half speed, so even a howler rarely goes below 4.5.
- Season averages: the best players average about 7.6–7.9; above 8 is for exceptional seasons.
- **Man of the match** (T, 2026-10-23): the player with the highest match rating, from either side. Ratings have one decimal, so ties go to the winning side, then more goals + assists, more minutes, and last the lower pid. Saved on the match record and counted per player on the season stat rows (10.3, 10.4), so later awards (e.g. player of the month) can use either. Shown in the box score, at full time of a watched match, on Player Stats, League Leaders and the profile's career table.
- Feed: form (market value), development (`performanceAdj`, rescaled so its effect is unchanged), awards.
- Saves from before the 6.9 scale (league DB v2) have their stored ratings converted once, when opened: new = 6.9 + 1.12 × (old − 6.6) (keepers 6.8 + …), with the soft top.

### 8.8 League style modifiers
Small per-league coefficients on inputs only (`competitions_mvp.json`): ENG2 ~10–15% fewer goals (chance quality), slightly more fouls, more direct/aerial AI tactics; GER1 slightly higher-scoring; ENG1 slightly fewer fouls.
- **Calibration:** the engine is tuned with all style modifiers neutral (1.0). Each league is then checked against target × its modifier (mapping in `calibration_targets.json` → `leagueChecks`). ENG2 landing ~2.5 goals per match is correct.

### 8.9 Discipline (T, 2026-10-21)
- A second-yellow dismissal earns a one-match ban; a straight red earns three. Bans cover the next domestic club fixtures across leagues, cups and play-offs, carry across seasons and transfers, and can be served while injured.
- **Yellow-card build-up** (T, 2026-10-25): every fifth yellow card of a season (the 5th, 10th, 15th…) earns a one-match ban, served like the others from the next fixture. Yellows count across leagues, cups and play-offs together, follow the player through transfers, and start again from zero each season. The yellow of a second-yellow dismissal doesn't count: that sending-off has its own ban. Older saves count from their next yellow.
- The sending-off fixture does not serve the new ban. Suspended players cannot play in simulated or watched matches. Older saves start without bans; past dismissals are not retroactively reconstructed.
- Red cards: T found about 0.18 a match too many (inside the accepted 0.08–0.20). The engine is now tuned to about 0.14, the target in `calibration_targets.json`.

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
Per player per club per competition per season (ZenGM-style), including man of the match awards (8.7). Per-90 values derived. Advanced stats (Value Added, on-pitch xG difference per 90, PPDA) are `[v1.1]`.

### 10.4 Match records
Box score + scoring summary + key events (goals with assister, cards, subs, injuries) + basic team stats + the man of the match (8.7). **No play-by-play is saved:** the live feed exists only on screen while watching.

### 10.5 Awards and history `[MVP]`
Player of the Year, Golden Boot, Top assists (T, 2026-10-25: most league assists, ties to fewer minutes as for the Golden Boot), Team of the Season (per league); league champions, promotions/relegations, cup winners; club history; player career stats; transactions log.

**Player honours** (T, 2026-10-25): a player's profile counts his own awards (Player of the Year, Golden Boot, Top assists, Team of the Season) and his club's league titles, cup wins and promotions in seasons he played at least once in that competition for that club. A promotion counts in the league the club went up from; play-off winners count as promoted; relegations don't count.

---

## 11. UI and screens

Mirror ZenGM's layout: a **top-bar Play button** (sim options + phase steps) and a **sidebar** of sections. Every TEAM page has a **team dropdown** (view any club). Tables are sortable and filterable, paginated where large. Player/team data tables use subtle alternating light-grey rows and hover shading; selection, league-zone and result colours take priority. Completed-match rows in Dashboard, Game Log and Schedule are green for wins, yellow for draws and red for losses. Dashboard/Schedule use the user club’s perspective; Game Log uses the viewed club. Other clubs’ Schedule fixtures stay neutral. Text/score information remains available independently of colour; upcoming user fixtures keep their existing blue Schedule highlight. Desktop web first. UI language: English with British football terminology `[DEFAULT]` (fixtures, defence, kit, transfer window, centre-back).

| Section | Screens `[MVP]` |
| --- | --- |
| General | Dashboard (next match, form, position, board confidence, condition alerts, and the Inbox: board messages, incoming bids, injuries, window deadlines, contract expiries) |
| League / World | Standings (zones for promotion, play-offs, relegation), Cups (own page, brackets), Weekly Schedule, Finances/Facilities overview of all clubs, History (champions, cup winners, awards, top scorers, top assists), Power Rankings, Transactions |
| Team | Squad, Tactics, Schedule (Sim game / Watch live), Box score / Game log, Finances/Facilities, History, Youth Academy |
| Players | Free Agents, Transfer Market (tabs: Search, Your listed players, Incoming offers, Loans), Player profile, Contract negotiation (modal) |
| Stats | League Leaders, Player Ratings, Player Stats, Team Stats, Injuries |
| Tools | Settings (rename the save, delete the league), Manage Leagues (create, switch, delete saves), How to play (a short guide, also linked from Manage Leagues; T, 2026-10-20) |

Skill tags (T, 2026-10-21) are cosmetic UI-only indicators beside names in Squad/Tactics, in ratings popovers and on profiles. Recomputed from displayed current integer ratings (rounded consistently across views); never stored or read by the engine. Hover/focus text explains the rule and current ratings. All qualifying tags are shown; no cap or elite tier.

| Tag | Strength | Inclusive cutoff |
| --- | --- | --- |
| Pc | Pacy | spd ≥70 |
| St | Strong | str ≥70 |
| Ae | Aerial threat | 0.50 hdr + 0.30 jmp + 0.20 str ≥70; hdr ≥65 |
| Dr | Skilled dribbler | drb ≥70 |
| Fi | Finisher | fin ≥70 |
| Pa | Smart passer | 0.40 spa + 0.35 oiq + 0.25 lpa ≥70; spa ≥60, oiq ≥60, lpa ≥55 |
| Sp | Set-piece specialist | stp ≥70; penalties excluded |
| Cr | Dangerous crosser | crs ≥70 |
| Bw | Ball winner | mean(tkl, ant) ≥70; both ≥65 |
| En | Engine | mean(end, wrk) ≥70; both ≥65 |
| Rf | Shot stopper | gkr ≥70; listed GK only |
| Ha | Safe hands | gkh ≥70; listed GK only |

Screen details:
- **Status tags** (T, 2026-10-21): Squad and Tactics use I (injured), E (expiring contract), TL (transfer listed), S plus remaining matches (suspended), L (loan) and A (academy). Hover or keyboard focus shows a full explanation, including injury duration, expiry date and listing price. Listing and expiry badges elsewhere use the same abbreviations.
- **Squad:** contract-expiry badges on players whose contracts end this 30 June (see 3.1). Chart-icon popovers show all 22 ratings in the ratings layout (4.2), highlighted for his listed position, and basic season stats without expanding the row; locally bundled flat SVG nationality flags appear in a separate column before season stats; injury badges immediately show remaining days and return date on hover or keyboard focus, outside table clipping; suspension badges show matches remaining.
- **Tactics:** formation dropdown preloads the 11 slots into a table; players are drag-and-drop ordered into slots and bench (ZenGM-style); slot OVR shown per player; the 3 sliders; live team ratings. No Auto toggle: these tactics apply to the matches the user watches. A shared pitch component supplements the table with the positional starting XI, slot OVR and condition. Pitch slots share the table’s drag/click/keyboard swap handlers and Save/Reset/Auto state; other clubs are read-only. While a player is dragged or picked, the places where he fits are highlighted on the pitch and in the tables (T, 2026-10-21), using the profile map's bands: darker where it's natural (his OVR there within 3 of his best), lighter where he can cover (4–8 below); everything else stays plain, with no OVR overlay. Into a slot, he must suit it; out of a slot, the player coming in must suit it; a swap inside the XI needs both to fit (the weaker counts). Keepers and outfielders never mix. The pre-match editor does the same. Preset changes reposition the configured slots. The pre-match editor also uses the pitch. Players show nationality flags, POT, season appearances/minutes/goals/assists/average rating, and chart-icon popovers for all 22 ratings (4.2) and basic season stats; in the XI the highlights follow the slot's position, and the legend says "this slot" when it isn't his own. OVR/POT show signed, colour-coded changes since the final recorded update of the previous season; first-season players show no invented change.
- **Watch live:** before kick-off, a **match preview** card (T, 2026-10-25): both clubs' last five results this season in any competition (fewer early in a season: last season's don't count; W/D/L badges linking to the box scores), the clubs' latest meeting in the save (or "haven't met"), and a derby badge when both clubs come from the same city; then temporary one-match changes to the saved lineup (incl. one-click Auto rotation); injured and suspended players are listed, greyed out, under Not in the squad and can't be picked (T, 2026-10-25). During: live text commentary, score and clock, live stats, energy bars, subs, sliders, pause button, and a speed slider (T, 2026-10-19); pausing (and half-time) opens the **tactics board** (T, 2026-10-21): the same pitch, XI and bench tables, formation and sliders as before kick-off, with energy in place of condition and this match's minutes, goals, assists and **rating so far** (his rating if the rest of his match is average; at full time, his match rating) in place of the season's, booking and injury badges, no reserves (only the bench can come on) and no Auto. Every change is previewed in the team ratings; **Make changes** makes them together (one window for its substitutions during play, none at a break), **Resume** drops any not made. Fit highlights as on Tactics; a sent-off player's empty slot lights up only for players already on the pitch. The live match is saved as it goes: closing the game mid-match resumes it on return, so there are no do-overs. **Commentary** (T, 2026-10-25): each shot says how the chance came about and who made it (the pass, cross or dribble and its wing, the set piece and its taker, a long ball, the ball won high, a rebound), and who saved or blocked it; cards and penalties name the foul behind them; a goal line carries the score. Each event has several phrasings, picked by a hash of the event (not the game's random numbers), so a reloaded match reads the same. A **Key moments / Full commentary** switch (full by default, remembered in the browser) narrows the feed to goals, cards, subs, injuries, penalties, period markers and big chances (0.30 xG or more). The engine only reports detail it already works out: no new random draws, results unchanged.
- **Transfer Market, Search:** name, nationality (including second nationality), league, position, minimum/maximum OVR, age range, minimum POT, maximum value, maximum yearly wage and final-year contract filters apply before the best 100 results are selected.
- **Transfer Market, Your listed players** (T, 2026-10-19): listing a player with an asking price makes AI clubs that need his position bid around that price during the windows. Unlisted players still get occasional bids.
- **Player profile:** compact bio (with his birthplace) and a positional OVR pitch map at top left, the ratings (4.2 layout, highlighted for his listed position) and the radar at top right with signed changes since last season; long labels have full-name tooltips. The positional map shows all ten position groups across 14 central/left/right spots; colours indicate best, comfortable (within 3 OVR), cover (4–8 below best), or less suited (9+ below best). This is an OVR comparison, not a new familiarity mechanic. Left/right share the stored base position OVR; Tactics applies foot fit. The mood breakdown is expandable. The **radar chart** uses 8 grouped axes (see config). An **Injury history** card (T, 2026-10-25) lists every injury since the league began (an older save: since its upgrade), newest first: date, injury, time out, and whether it came in a match (linking to its box score, with the opponent) or in training. An **Honours** card (T, 2026-10-25) lists each kind of honour once with its count and seasons ("2× Champion: English top flight 2027/28, 2029/30"), and the **Career** table shows the matching badges on each season row, ZenGM-style (club honours gold, personal awards blue; §10.5). A **Form** card (T, 2026-10-25) lists his last five matches this season (fewer early on), newest first: date, competition, venue, opponent, score, minutes, goals, assists and match rating (with the man-of-the-match star). Also includes a ratings-history table (age, OVR, POT and all 22 ratings at every update), career stats, contract, mood (with ZenGM-style breakdown popup), condition and injury, transfer history.
- **Inbox** (T, 2026-10-25): lives in the Dashboard's right-hand column, with no page of its own (old `/inbox` links open the Dashboard; the sidebar's unread count sits on Dashboard). Every message, newest first, in a list that scrolls on its own; a filter by kind and Mark all read. A bid for one of the user's players carries **Accept** and **Reject** in its message while the bid is open (the same answer as Transfer Market › Incoming offers), and the bid's status once it closes.
- **Inbox player links** (T, 2026-10-21): subjects and bodies link the players they name. New transfer, bid, loan, contract and academy messages keep stable player IDs with snapshot names (§12). Older transfer, contract and injury messages gain links when a full name identifies a unique current player; ambiguous names stay plain text. Opening and marking messages read work independently of the links.
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
| `players` | Bio; ratings history (array per development update); position OVRs + POT; hidden ceiling, curve type, hidden traits; mood traits; contract; status (club, academy, loan, free agent, retired); injury; injury history (every injury since the league began: date, type, days out, the match and opponent or training; T, 2026-10-25); condition; suspension (matches left, date issued; §8.9); yellow cards toward a ban this season (§8.9); transfer history |
| `playerStats` | Per player per club per competition per season |
| `fixtures` | Date, slot, competition, round, home/away, result reference |
| `matches` | Box score, scoring summary, key events, team stats, player match ratings |
| `offers` | Live bids, loan offers, negotiations, deadlines |
| `transactions` | Permanent log (transfers, loans, signings, renewals, releases, academy promotions, retirements) with name snapshots |
| `inbox` | Messages to the user, with the players they name (IDs + snapshot names) and, for a bid, the bidding club (`bidFrom`); both optional, absent in older saves |
| `awards` | Season awards, champions, cup winners, records (with name snapshots) |

- **Stored:** position OVRs + POT. **Derived on the fly:** team ratings/OVR, standings, per-90s, market value. **Match-only:** in-match energy.
- **Retention:** full match records kept **2 seasons** in the MVP (setting), except the user's club matches, kept forever. The default scales down with world size later (e.g. current season only for other clubs once all 10 leagues are on). Season stat rows are kept forever unless the player is pruned (below).
- **Pruning:** retired players with no awards, low peak OVR and no notable spell at the user's club are deleted a few seasons after retiring, with their stat rows; transactions and awards keep name snapshots.
- Conventions: integer IDs; money in whole € per year; ISO date strings; every season-scoped row tagged with `season`.
- Saves are **local only** (no accounts, no cloud sync). `[Later]` export/import.

---

## 13. Tech architecture

- **Single-page app running fully in the browser.** Game core in a **Shared Worker** (Web Worker fallback). Each tab runs UI only and talks to the worker through **typed calls** (ZenGM's `toWorker`/`toUI` pattern). The UI never touches IndexedDB directly.
- **One league open at a time** (T, 2026-10-20). Every tab on that league stays in sync. The league opened most recently on purpose (by arriving on its pages, or with "Open this league here") is the open one. Tabs showing another league stop and say why; their calls are refused instead of switching the league back. An action under way finishes and is saved before the switch. With the Web Worker fallback, only one tab can run the game.
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
- Performance budget `[DEFAULT]`: one headless match < 5 ms; a full MVP season in-browser < 60 s on a mid-range laptop including season processing; save < 100 MB after 10 seasons. "Mid-range laptop" = a machine 4× slower than the developer's: each season's measured time × 4, in the automated `perf` check. Chrome's CPU throttling doesn't reach the game's worker, so it can't be used (T, 2026-10-20).

---

## 15. Roadmap summary
- **v1.1:** Rest of World market and exits; scouting fog (Scouting dial, fuzzy displayed ratings, reveal hidden traits); squad role promises; pre-contracts; advanced stats (Value Added, on-pitch xG difference, PPDA) then OVR weight and scaling refit; Watch List; Compare Players.
- **Later:** all 10 leagues + world-size setting; European competitions + guest clubs; owner types; God Mode; export/import; custom rosters; Manage Teams; dark mode; more formations; 36-team league phase; extra domestic cups; international breaks and national teams; offline (service worker).
- **Skill tags:** implemented as cosmetic UI indicators (see §11); no gameplay effect.

---

## 16. Glossary
- **OVR:** overall rating for a position. **POT:** displayed potential. **Ceiling:** hidden true potential.
- **Condition:** between-match freshness (saved). **Energy:** in-match freshness (not saved).
- **Squad cost ratio:** (wages + amortised fees) / revenue; FFP cap 70%.
- **Window:** transfer and renewal period (summer, winter).
- **Slot:** a position in a formation (group + side).

