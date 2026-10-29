# Soccer Sim Game

A free, browser-based soccer management sim in the spirit of the ZenGM games. Build a club across endless seasons: develop academy prospects through minutes, rotate a fatigued squad, trade in two transfer windows, and fight promotion and relegation. Or pick the Super League, a world of three tiers with a draft, trades and a salary cap.

Status: v0.3 (the Super League, a second world with a draft, trades and a salary cap; your own club names; live commentary, match previews and richer player profiles), after v0.2 and v0.1, the first release. See `docs/SPEC.md` for the design, `docs/MILESTONES.md` for the build plan and `docs/PROGRESS.md` for progress.

Runs entirely in your browser. Saves stay on your device.

**Play:** https://soccer-sim-game.pages.dev. New to it? The game's **How to play** page (linked from Manage Leagues and the sidebar's Tools) explains the basics. What's in each release: `CHANGELOG.md`.

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
| `pnpm browsercheck [m5 m6 sweep career edges tabs layout perf injury tables formation messages board prematch commentary preview honours tactics superleague] [--base URL]` | Headless Chrome checks of the production build (run `pnpm build && pnpm preview` first; needs Google Chrome installed). `m5` checks every game page, `m6` the management screens, `career` runs a club for three seasons through the screens (the M6 acceptance); `sweep` plays a full season with the Play menu and opens every page at six points of it; `edges` the empty and edge states (relegation, extra time, an FFP ban, negative cash); `tabs` two tabs, reloads mid-action, long names and plain-word errors; `layout` every page at laptop sizes and with the narrow sidebar; `perf` plays ten seasons and checks the performance budget, the save size and data retention. `injury` verifies that hovering/focusing red injury badges renders a visible duration tooltip outside scrolling tables. `tables` checks alternating row shades and whole-row win/draw/loss colours in Dashboard, Game Log and Schedule. `formation` checks every preset pitch, pitch/table swaps, keyboard and drag controls, persistence, read-only clubs, and the player position map. `messages` checks clickable inbox subjects/bodies and independent expansion controls. `board` sends a centre-back off in a watched match and fixes it on the pause screen's tactics board (a substitute on for a midfielder, moved into the empty slot). `prematch` the saved tactics before a watched match, with kick-off held while someone in them can't play; `commentary` the live commentary and its Key moments switch; `preview` the match preview and the profile's form, birthplace and injury history; `honours` Top assists and the profile's honours; `tactics` that simulated matches start from the saved tactics and never change them; `superleague` New game's world choice and names file, then a Super League club through three seasons (standings, play-offs, the draft, trades, re-signing, free agents, the cap). With no names, all run, one after another (a few minutes) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` | ESLint + Prettier check + type check |
| `pnpm format` | Format code with Prettier |
| `pnpm generate [--seed X] [--world <id>] [--check]` | Generate a new league headlessly (Classic, or `--world superLeague`) and report its checks |
| `pnpm calibrate [--matches N] [--seasons S] [--worlds W] [--seed X] [--check]` | Match-engine calibration: per-match targets on a neutral sample and each league's style checks, pass/fail against `data/config/calibration_targets.json` (`--check` exits 1 on a failure) |
| `pnpm calibrate --world [--seasons 20] [--worlds 3] [--seed X] [--overrides JSON] [--check]` | Season-loop calibration: whole worlds played for 20 seasons (in parallel), checked against the season, development, stability, economy and world-shape targets, plus the M4 exploit checks. `--overrides '{"dev":{...}}'` tries coefficient changes in memory (also for `pnpm calibrate`). `pnpm calibrate --world superLeague` runs the Super League's tier report instead: movement between tiers, the draft, trades, the cap and world health |
| `pnpm season [--seasons N] [--seed X] [--world <id>] [--quiet]` | Plays seasons headlessly and prints tables, cups, play-offs, promotion and relegation, and the season numbers |
| `pnpm calendar [--season Y] [--world <id>]` | Prints a season's match calendar (league rounds, cup rounds, play-offs) |

**The game** opens on Manage Leagues (`/`), where you start a new league (Classic or the Super League) as any club and reopen your saves. Inside a league, the top bar has the Play menu and the date, and the sidebar lists the pages: Dashboard (with the inbox); Standings, Cups, Schedule, Power Rankings, Finances, History and Transactions; your Squad, Tactics, Game Log, Team History, Youth Academy and Finances & Facilities; Free Agents and the Transfer Market; League Leaders, Player Ratings, Player Stats, Team Stats and Injuries; Settings and How to play. In the Super League, Cups is Play-offs, and Draft, Trade, Trading Block, Re-sign Players and Draft Picks take the place of the Transfer Market and the Youth Academy. Play → Watch your next match opens the live match, where you change your team before kick-off and at any pause. Player names open profiles and scores open box scores. Every page has its own URL, so links, back and reload work.

Layout: `src/ui` (React tabs, UI only), `src/worker` (game core, runs in a SharedWorker), `src/common` (types and the UI↔worker protocol shared by both), `tools/` (harness, generators, browser checks), `data/` (fixed inputs).

Note for `pnpm dev`: the game core is a SharedWorker that lives as long as any tab has the page open. After changing worker code, close every tab of the app (or reload with all other tabs closed) to load the new worker.
