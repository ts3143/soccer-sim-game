# Name and birthplace sources

All files in this folder come from **[Wikidata](https://www.wikidata.org/)**, whose structured data is released under **CC0 1.0** (public domain dedication): no attribution is required, but we credit it here.

Built by `tools/names/build-names.ts` (re-runnable; output committed). Fetched 2026-10-14 from the Wikidata Query Service.

## Method
For each nationality, the script counts **male association football players** (`P106 = Q937857`, `P21 = Q6581097`) **born in 1950 or later** and groups them by:

- **given name** (`P735`): top 200
- **family name** (`P734`): top 400
- **place of birth** (`P19`): top 40, excluding the country item itself and anything that is a country

Each entry is `[label, weight]`, where the weight is the number of footballers carrying that name (or born in that place). The generator samples names and birthplaces in proportion to these weights, and combines a first and last name independently, so generated names are fictional combinations; an occasional match with a real person is possible and accepted.

Labels are English (falling back to Wikidata's multilingual label). Unlabelled items, labels with digits or brackets, and over-long labels are dropped. Ties in count are ordered by a hash of the label so the cut-off doesn't favour early-alphabet names.

Nationality → Wikidata item: "country of citizenship" (`P27`) for most countries. England, Scotland, Wales and Northern Ireland use "country for sport" (`P1532`), because Wikidata records those players as UK citizens. Denmark and the Netherlands use the Kingdom of Denmark (`Q756617`) and Kingdom of the Netherlands (`Q29999`), the items Wikidata uses for their citizenship. The full mapping is in the script.

Known quirks: Iceland has few family names (most Icelanders use patronymics); Denmark's birthplaces include some Faroese towns.

## Files
| Code | Given names | Family names | Birthplaces |
| --- | --- | --- | --- |
| ARG | 200 | 400 | 40 |
| AUS | 200 | 400 | 40 |
| AUT | 200 | 400 | 40 |
| BEL | 200 | 400 | 40 |
| BIH | 200 | 290 | 40 |
| BRA | 200 | 400 | 40 |
| CIV | 200 | 215 | 40 |
| CMR | 200 | 235 | 40 |
| COL | 200 | 400 | 40 |
| CRO | 200 | 400 | 40 |
| CZE | 157 | 400 | 40 |
| DEN | 200 | 400 | 40 |
| ENG | 200 | 400 | 40 |
| ESP | 200 | 400 | 40 |
| FRA | 200 | 400 | 40 |
| GER | 200 | 400 | 40 |
| GHA | 200 | 310 | 40 |
| HUN | 200 | 400 | 40 |
| IRL | 200 | 400 | 40 |
| ISL | 200 | 75 | 40 |
| ITA | 200 | 400 | 40 |
| JAM | 199 | 192 | 40 |
| JPN | 200 | 400 | 40 |
| KOR | 200 | 112 | 40 |
| MAR | 200 | 215 | 40 |
| NED | 200 | 400 | 40 |
| NGA | 200 | 400 | 40 |
| NIR | 164 | 245 | 40 |
| NOR | 200 | 400 | 40 |
| POL | 200 | 400 | 40 |
| POR | 200 | 400 | 40 |
| SCO | 200 | 400 | 40 |
| SEN | 200 | 153 | 40 |
| SRB | 200 | 400 | 40 |
| SUI | 200 | 400 | 40 |
| SVK | 158 | 391 | 40 |
| SWE | 200 | 400 | 40 |
| TUR | 200 | 400 | 40 |
| URU | 200 | 400 | 40 |
| USA | 200 | 400 | 40 |
| WAL | 200 | 266 | 40 |
