/**
 * Builds data/names/<CODE>.json for every nationality in nationalities.json (league and
 * country mixes), from Wikidata (CC0 1.0): given names, family names and birthplaces of
 * male association football players, weighted by how many players carry each. Re-runnable; the output
 * is committed and treated as a fixed input. Sources are documented in SOURCES.md.
 *
 *   pnpm exec tsx tools/names/build-names.ts            # all nationalities
 *   pnpm exec tsx tools/names/build-names.ts ISL JAM    # just these
 */
import { readFileSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "soccer-sim-game-names/1.0 (https://github.com/ts3143/soccer-sim-game)";
const BORN_FROM = 1950;
const LIMITS = { given: 200, family: 400, birthplaces: 40 } as const;

/**
 * Wikidata item per nationality code. England, Scotland, Wales and Northern Ireland
 * players are UK citizens on Wikidata, so those four use "country for sport" (P1532);
 * everyone else uses "country of citizenship" (P27). Denmark and the Netherlands record
 * citizenship as the Kingdom items, not the country items.
 */
const COUNTRIES: Record<string, { qid: string; prop: "P27" | "P1532" }> = {
  ARG: { qid: "Q414", prop: "P27" },
  AUS: { qid: "Q408", prop: "P27" },
  AUT: { qid: "Q40", prop: "P27" },
  BEL: { qid: "Q31", prop: "P27" },
  BIH: { qid: "Q225", prop: "P27" },
  BRA: { qid: "Q155", prop: "P27" },
  CIV: { qid: "Q1008", prop: "P27" },
  CMR: { qid: "Q1009", prop: "P27" },
  COL: { qid: "Q739", prop: "P27" },
  CRO: { qid: "Q224", prop: "P27" },
  CZE: { qid: "Q213", prop: "P27" },
  DEN: { qid: "Q756617", prop: "P27" }, // Kingdom of Denmark (citizenship item)
  ENG: { qid: "Q21", prop: "P1532" },
  ESP: { qid: "Q29", prop: "P27" },
  FRA: { qid: "Q142", prop: "P27" },
  GER: { qid: "Q183", prop: "P27" },
  GHA: { qid: "Q117", prop: "P27" },
  HUN: { qid: "Q28", prop: "P27" },
  IRL: { qid: "Q27", prop: "P27" },
  ISL: { qid: "Q189", prop: "P27" },
  ITA: { qid: "Q38", prop: "P27" },
  JAM: { qid: "Q766", prop: "P27" },
  JPN: { qid: "Q17", prop: "P27" },
  KOR: { qid: "Q884", prop: "P27" },
  MAR: { qid: "Q1028", prop: "P27" },
  NED: { qid: "Q29999", prop: "P27" }, // Kingdom of the Netherlands (citizenship item)
  NGA: { qid: "Q1033", prop: "P27" },
  NIR: { qid: "Q26", prop: "P1532" },
  NOR: { qid: "Q20", prop: "P27" },
  POL: { qid: "Q36", prop: "P27" },
  POR: { qid: "Q45", prop: "P27" },
  SCO: { qid: "Q22", prop: "P1532" },
  SEN: { qid: "Q1041", prop: "P27" },
  SRB: { qid: "Q403", prop: "P27" },
  SUI: { qid: "Q39", prop: "P27" },
  SVK: { qid: "Q214", prop: "P27" },
  SWE: { qid: "Q34", prop: "P27" },
  TUR: { qid: "Q43", prop: "P27" },
  UKR: { qid: "Q212", prop: "P27" },
  URU: { qid: "Q77", prop: "P27" },
  USA: { qid: "Q30", prop: "P27" },
  WAL: { qid: "Q25", prop: "P1532" },
};

type Kind = keyof typeof LIMITS;
type Weighted = [string, number];

const VALUE_PROP: Record<Kind, string> = { given: "P735", family: "P734", birthplaces: "P19" };

function query(kind: Kind, country: { qid: string; prop: string }): string {
  const excludePlaces =
    kind === "birthplaces"
      ? `FILTER(?value != wd:${country.qid}) FILTER NOT EXISTS { ?value wdt:P31 wd:Q6256. }`
      : "";
  return `
SELECT ?valueLabel (COUNT(DISTINCT ?player) AS ?n) WHERE {
  ?player wdt:P106 wd:Q937857;
          wdt:${country.prop} wd:${country.qid};
          wdt:P21 wd:Q6581097;
          wdt:P569 ?born;
          wdt:${VALUE_PROP[kind]} ?value.
  FILTER(YEAR(?born) >= ${BORN_FROM})
  ${excludePlaces}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
GROUP BY ?valueLabel
ORDER BY DESC(?n) MD5(STR(?valueLabel))
LIMIT ${LIMITS[kind] * 2}`;
}

interface SparqlResponse {
  results: { bindings: { valueLabel?: { value: string }; n: { value: string } }[] };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(sparql: string, attempt = 1): Promise<SparqlResponse> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
    });
  } catch (error) {
    if (attempt >= 5) throw error;
    console.warn(`  network error (${String(error)}), retrying in 5s`);
    await sleep(5000);
    return run(sparql, attempt + 1);
  }
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const wait = Number(response.headers.get("retry-after") ?? 10) * 1000;
    console.warn(`  HTTP ${response.status}, retrying in ${wait / 1000}s`);
    await sleep(wait);
    return run(sparql, attempt + 1);
  }
  if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}: ${await response.text()}`);
  return (await response.json()) as SparqlResponse;
}

/**
 * Keeps human-readable labels: drops unlabeled items (Q123), digits and qualifiers.
 * Ties in count are ordered by a hash of the label (in the query), so the cut-off
 * at the limit doesn't favour names early in the alphabet.
 */
function clean(kind: Kind, response: SparqlResponse): Weighted[] {
  const out: Weighted[] = [];
  for (const row of response.results.bindings) {
    const label = row.valueLabel?.value.trim() ?? "";
    if (!label || /^Q\d+$/.test(label) || /[\d()[\],/]/.test(label) || label.length > 30) continue;
    if (kind !== "birthplaces" && /\s/.test(label) && label.split(/\s+/).length > 2) continue;
    out.push([label, Number(row.n.value)]);
    if (out.length === LIMITS[kind]) break;
  }
  return out;
}

const formatList = (rows: Weighted[]) =>
  `[\n${rows.map((row) => `    ${JSON.stringify(row)}`).join(",\n")}\n  ]`;

async function build(code: string): Promise<{ code: string; counts: Record<Kind, number> }> {
  const country = COUNTRIES[code];
  if (!country) throw new Error(`No Wikidata mapping for nationality ${code}`);
  const lists = {} as Record<Kind, Weighted[]>;
  for (const kind of Object.keys(LIMITS) as Kind[]) {
    lists[kind] = clean(kind, await run(query(kind, country)));
    await sleep(1000);
  }
  const json =
    `{\n  "code": ${JSON.stringify(code)},\n  "source": "Wikidata (CC0 1.0), see SOURCES.md",\n` +
    `  "given": ${formatList(lists.given)},\n  "family": ${formatList(lists.family)},\n` +
    `  "birthplaces": ${formatList(lists.birthplaces)}\n}\n`;
  writeFileSync(new URL(`../../data/names/${code}.json`, import.meta.url), json);
  return {
    code,
    counts: {
      given: lists.given.length,
      family: lists.family.length,
      birthplaces: lists.birthplaces.length,
    },
  };
}

const nationalities = JSON.parse(
  readFileSync(new URL("../../data/config/nationalities.json", import.meta.url), "utf8"),
) as {
  leagueMix: Record<string, Record<string, number>>;
  countryMix?: Record<string, Record<string, number>>;
};
const mixes = [
  ...Object.values(nationalities.leagueMix),
  ...Object.values(nationalities.countryMix ?? {}),
];
const allCodes = [...new Set(mixes.flatMap(Object.keys))].sort();
const codes = process.argv.length > 2 ? process.argv.slice(2) : allCodes;

for (const code of codes) {
  const { counts } = await build(code);
  const warn =
    counts.given < 40 || counts.family < 80 || counts.birthplaces < 10 ? "  <- small" : "";
  console.log(
    `${code}: ${counts.given} given, ${counts.family} family, ${counts.birthplaces} places${warn}`,
  );
}
