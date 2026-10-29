# Club generation scripts

Generated `data/clubs_2026_27.json` and `data/crests/*.svg` before the build started; the Super League's clubs were added in SL1.

- `build_clubs.py` — Classic's 62-club table (edit values in the `add(...)` lines). Writes `data/clubs_2026_27.json` and a local `clubs_tables.md`. A club's code (crest file, random stream) is its abbreviation unless given: the clubs renamed to T's names keep their original code.
- `build_super_league.py` — the Super League's 48 clubs (SPEC §17.3). Writes `data/clubs_super_league_2026_27.json` and a local `super_league_tables.md`. Clubs also in Classic use the Classic code and values.
- `build_crests.py` — crest SVGs for both files from each club's colors, crest shape and initials (`crest_art.py`), plus a local `crest_preview.html`. A club in both worlds gets one crest.

Run in order with Python 3: `python3 build_clubs.py && python3 build_super_league.py && python3 build_crests.py`. Re-running reproduces the shipped data exactly. Change club values only with T's approval.
