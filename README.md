# Soccer Sim Game

A free, browser-based soccer management sim in the spirit of the ZenGM games. Build a club across endless seasons: develop academy prospects through minutes, rotate a fatigued squad, trade in two transfer windows, and fight promotion and relegation.

Status: in development (milestone M0, scaffold and plumbing). See `docs/SPEC.md` for the design, `docs/MILESTONES.md` for the build plan and `docs/PROGRESS.md` for progress.

Runs entirely in your browser. Saves stay on your device.

## Development

Requires Node 24 (see `.nvmrc`) and pnpm, which Node's corepack provides:

```
corepack enable pnpm
pnpm install
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server with hot reload |
| `pnpm build` | Type check, then production build into `dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` | ESLint + Prettier check + type check |
| `pnpm format` | Format code with Prettier |
| `pnpm calibrate` | Headless calibration harness (stub until M2) |

Layout: `src/ui` (React tabs, UI only), `src/worker` (game core, runs in a SharedWorker), `src/common` (types and the UI↔worker protocol shared by both), `tools/` (harness, generators), `data/` (fixed inputs).

Note for `pnpm dev`: the game core is a SharedWorker that lives as long as any tab has the page open. After changing worker code, close every tab of the app (or reload with all other tabs closed) to load the new worker.
