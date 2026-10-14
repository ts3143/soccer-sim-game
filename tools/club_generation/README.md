# Club generation scripts

Generated `data/clubs_2026_27.json` and `data/crests/*.svg` before the build started.

- `build_clubs.py` — the 62-club table (edit values in the `add(...)` lines). Writes `data/clubs_2026_27.json` and a local `clubs_tables.md`.
- `build_crests.py` — crest SVGs from each club's colors and crest shape, plus a local `crest_preview.html`.

Run in order with Python 3: `python3 build_clubs.py && python3 build_crests.py`. Re-running reproduces the shipped data exactly. Change club values only with T's approval.
