# Soccer Sim Game

A free, browser-based soccer management sim in the spirit of the ZenGM games. Build a club across endless seasons: develop academy prospects through minutes, rotate a fatigued squad, trade in two transfer windows, and fight promotion and relegation.

Status: in development (milestone M2, match engine and calibration harness). See `docs/SPEC.md` for the design, `docs/MILESTONES.md` for the build plan and `docs/PROGRESS.md` for progress.

Runs entirely in your browser. Saves stay on your device.

Hosted on Cloudflare Pages: production at https://soccer-sim-game.pages.dev (from `main`); every other branch gets a preview at `https://<branch>.soccer-sim-game.pages.dev`.

## Development

Requires Node 24 (see `.nvmrc`) and pnpm, which Node's corepack provides:

```
corepack enable pnpm
pnpm install
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server with hot reload |
| `pnpm build` | Type check, production build into `dist/`, then check no real club names shipped |
| `pnpm preview` | Serve the production build locally |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` | ESLint + Prettier check + type check |
| `pnpm format` | Format code with Prettier |
| `pnpm generate [--seed X] [--check]` | Generate a new league headlessly and report the M1 checks |
| `pnpm calibrate [--matches N] [--seasons S] [--worlds W] [--seed X] [--check]` | Headless calibration harness: simulates matches and seasons and reports pass/fail against `data/config/calibration_targets.json` (`--check` exits 1 on a failure) |

The developer page has two tabs per saved league: **Generation** (M1: the generated world, its checks, clubs and squads) and **Match lab** (M2: simulate or watch a match between any two clubs, or simulate 1,000 matches against the targets). Both are temporary; the game screens arrive in M5 and M6.

Layout: `src/ui` (React tabs, UI only), `src/worker` (game core, runs in a SharedWorker), `src/common` (types and the UI↔worker protocol shared by both), `tools/` (harness, generators), `data/` (fixed inputs).

Note for `pnpm dev`: the game core is a SharedWorker that lives as long as any tab has the page open. After changing worker code, close every tab of the app (or reload with all other tabs closed) to load the new worker.
