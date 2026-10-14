# CLAUDE.md — Soccer Sim Game

A browser-based soccer management sim modeled on the ZenGM games (Basketball GM, Football GM, ZenGM Hockey). The user is the GM of a club across endless seasons. Owner: T (product owner; tech-savvy engineer, light AI/ML background).

## Source of truth
1. `docs/SPEC.md` — the full game spec. **Read it before any work.** If code and spec disagree, the spec wins.
2. `docs/MILESTONES.md` — build order and acceptance checks. Work one milestone at a time.
3. `docs/OPEN_QUESTIONS.md` — defaults to build with, and questions still open for T.
4. `data/` — club dataset, crests and config. Treat as fixed inputs; change only with T's approval.
5. The living design doc (Claude Docs, owned by T) holds the decisions log. SPEC.md is its build-ready consolidation.

Never change a decided behaviour silently. If something in the spec is wrong, unclear or blocking, stop and ask T, proposing a fix. Record any approved change in SPEC.md and `docs/PROGRESS.md`.

## Scope discipline
- Build only what is tagged `[MVP]` (or untagged) in SPEC.md. `[v1.1]` and `[Later]` items are out of scope, but **design data structures so they can be added without rewrites** (e.g. world size, more leagues, Europe, Scouting dial, RoW).
- Leagues, competitions and formations are **data-driven config**, never hardcoded.

## Architecture rules (mirror ZenGM, never copy its code)
- ZenGM is **not open source**. Copy architecture and patterns only; write every line fresh.
- Single-page app, fully client-side. Game core runs in a **Shared Worker** (Web Worker fallback); tabs run UI only and talk to the worker through **typed calls**. The UI never touches IndexedDB.
- **IndexedDB per league save + in-memory cache** for current-season data.
- **All randomness goes through the seeded RNG.** No `Math.random()` anywhere in game logic.
- **The match engine is resumable:** it runs possession by possession and can pause for input.
- Money: integer whole euros, wages per year. Dates: ISO strings. IDs: integers. Season-scoped rows carry `season`.
- **Real club names never appear in the UI.** `based_on` in the club data is a dev reference only.

## Stack
TypeScript (strict), React, Bootstrap 5, Vite, pnpm, Vitest, ESLint + Prettier. Hosted on Cloudflare Pages from the public GitHub repo `soccer-sim-game`. Saves are local only.

```
src/ui        React UI (pages, components)
src/worker    Game core: engine, development, finances, transfers, ai, schedule, db
src/common    Shared types, schema, constants, config loaders
data/         clubs_2026_27.json, crests/, config/, names/
tools/        calibration harness, generators
docs/         SPEC, MILESTONES, OPEN_QUESTIONS, PROGRESS, ASSETS
```

## Commands
```
pnpm dev          # local dev server
pnpm build        # production build
pnpm test         # unit tests (Vitest)
pnpm lint         # ESLint + type check
pnpm calibrate    # headless multi-season sim, pass/fail vs data/config/calibration_targets.json
```

## How to work
- Start each milestone by restating its scope and acceptance checks, then propose a short plan before coding.
- Engine and simulation first, UI last (M0 → M7).
- Write unit tests for formulas (OVR, development, fatigue, finances, valuation) and determinism.
- Use the calibration harness as the gate for M2–M4. Tune coefficients, never results.
- Keep commits small and descriptive. Update `docs/PROGRESS.md` at the end of each milestone: what was built, deviations from spec, open issues.
- When a tuning choice is a judgment call, pick the option closest to ZenGM's behaviour and note it in PROGRESS.md.
- Explain decisions to T in plain language; he is the product owner, not a game-engine specialist.
