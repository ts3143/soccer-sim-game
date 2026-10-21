# Kickoff Package — Assets Checklist

Everything Claude Code needs to start building. Copy the whole package into the repo root.

| Path | What it is | Used in |
| --- | --- | --- |
| `CLAUDE.md` | Project brief and working rules for Claude Code | Every session |
| `docs/SPEC.md` | Full game spec (consolidated decisions) | Every milestone |
| `docs/MILESTONES.md` | Build order M0–M7 with acceptance checks | Every milestone |
| `docs/OPEN_QUESTIONS.md` | Questions for T and defaults to build with | M1 onward |
| `docs/PROGRESS.md` | Running build log (Claude Code updates it) | Every milestone |
| `data/clubs_2026_27.json` | 62 MVP clubs: names, colors, capacity, market, reputation, revenue, strength, crest spec | M1 |
| `data/crests/*.svg` | 62 generated crests in club colors | M1, M5 |
| `data/config/ratings_positions.json` | 22 ratings (fixed order), age-curve groups, radar axes, 10 position weights, OVR bands | M1, M2, M5 |
| `data/config/formations_tactics.json` | 8 formations (5 MVP), sliders, team-rating recipes, substitutions | M2, M6 |
| `data/config/competitions_mvp.json` | ENG1, ENG2, GER1, cups, windows, key dates, roster rules, style modifiers | M1, M3 |
| `data/config/nationalities.json` | Nationality mix per league, youth-intake share, preferred-foot rules | M1 |
| `data/config/calibration_targets.json` | Engine, season, development, stability and performance targets | M2–M4, M7 |
| `tools/club_generation/` | Python scripts that generated the club data and crests (re-run to tweak values) | As needed |

## Still to create during the build
- `data/names/<nationality>.json` + `data/names/SOURCES.md` (M1, from public-domain or permissively licensed name lists).

## Living references (outside the repo)
- Design doc (Claude Docs) with the full decisions log.
- Crest preview page (Claude artifact).

## Suggested first prompt for Claude Code
> Read CLAUDE.md, docs/SPEC.md, docs/MILESTONES.md and docs/OPEN_QUESTIONS.md. Summarise the MVP in 10 bullets, list anything unclear or contradictory, then propose your plan for M0. Don't write code until I approve the plan.

## Nationality flags

`public/flags/*.svg`: flat 4:3 flags from [flag-icons](https://github.com/lipis/flag-icons), by Panayiotis Lipiridis, MIT licensed. The licence is retained in `public/flags/LICENSE`. Assets are bundled locally; no third-party image requests are made during play. Includes England, Scotland, Wales and Northern Ireland as separate football nationalities.
