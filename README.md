# Soccer Sim Game

A free, browser-based soccer management sim in the spirit of the ZenGM games. Build a club across endless seasons: develop academy prospects through minutes, rotate a fatigued squad, trade in two transfer windows, and fight promotion and relegation.

Status: in development (milestone M6, management UI). See `docs/SPEC.md` for the design, `docs/MILESTONES.md` for the build plan and `docs/PROGRESS.md` for progress.

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
| `pnpm browsercheck [m1 m3 m4 m5 m6 sweep career] [--base URL]` | Headless Chrome checks of the production build (run `pnpm build && pnpm preview` first; needs Google Chrome installed). `m5` checks every game page, `m6` the management screens, `career` runs a club for three seasons through the screens (the M6 acceptance); `sweep` plays a full season with the Play menu and opens every page at six points of it; `m1`, `m3` and `m4` check the developer pages. With no names, all run (a few minutes) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` | ESLint + Prettier check + type check |
| `pnpm format` | Format code with Prettier |
| `pnpm generate [--seed X] [--check]` | Generate a new league headlessly and report the M1 checks |
| `pnpm calibrate [--matches N] [--seasons S] [--worlds W] [--seed X] [--check]` | Match-engine calibration: per-match targets on a neutral sample and each league's style checks, pass/fail against `data/config/calibration_targets.json` (`--check` exits 1 on a failure) |
| `pnpm calibrate --world [--seasons 20] [--worlds 3] [--seed X] [--overrides JSON] [--check]` | Season-loop calibration: whole worlds played for 20 seasons (in parallel), checked against the season, development, stability, economy and world-shape targets, plus the M4 exploit checks. `--overrides '{"dev":{...}}'` tries coefficient changes in memory (also for `pnpm calibrate`) |
| `pnpm season [--seasons N] [--seed X] [--quiet]` | Plays seasons headlessly and prints tables, cups, play-offs, promotion and relegation, and the season numbers |
| `pnpm calendar [--season Y]` | Prints a season's match calendar (league rounds, cup rounds, play-offs) |

**The game** opens on Manage Leagues (`/`), where you start a new league as any club and reopen your saves. Inside a league, the top bar has the Play menu and the date, and the sidebar lists the pages: Dashboard and Inbox; Standings, Cups, Schedule, Power Rankings, Finances, History and Transactions; your Squad, Tactics, Game Log, Team History, Youth Academy and Finances & Facilities; Free Agents and the Transfer Market; League Leaders, Player Ratings, Player Stats, Team Stats and Injuries; Settings. Play → Watch your next match opens the live match, where you change your team before kick-off and at any pause. Player names open profiles and scores open box scores. Every page has its own URL, so links, back and reload work.

The developer pages (`/dev`, under Tools in the sidebar) have four tabs per saved league: **Generation** (M1: the generated world, its checks, clubs and squads), **Match lab** (M2: simulate or watch a match between any two clubs, or simulate 1,000 matches against the targets), **Season lab** (M3: play the season with the Play-menu actions; tables, results, cups, play-offs, injuries, academies, transactions, awards, the board and the inbox) and **Club lab** (M4: every club's finances, FFP and board; your budgets and the fees/wages control; contract talks to renew, bid, sign a free agent or propose a loan; bids for your players; the season's transfer log and the inbox). They stay until M6's transfer and management screens replace the Club lab, and are removed in M7.

Layout: `src/ui` (React tabs, UI only), `src/worker` (game core, runs in a SharedWorker), `src/common` (types and the UI↔worker protocol shared by both), `tools/` (harness, generators, browser checks), `data/` (fixed inputs).

Note for `pnpm dev`: the game core is a SharedWorker that lives as long as any tab has the page open. After changing worker code, close every tab of the app (or reload with all other tabs closed) to load the new worker.
