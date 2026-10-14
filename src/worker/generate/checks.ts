/**
 * M1 acceptance checks on a generated world: used by `pnpm generate --check`, the tests
 * and the inspector page. Thresholds that turn the spec's wording into numbers ("few
 * 75+, many 50–65") are judgment calls, documented in PROGRESS.md.
 */
import { clubDefinitions } from "../../common/config/clubs";
import type { Club, ClubSeason, Player } from "../../common/schema";
import { STARTING_SQUAD_COST } from "./contracts";
import { FREE_AGENT_POOL_SIZE } from "./freeAgents";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

export interface WorldLike {
  clubs: Club[];
  clubSeasons: ClubSeason[];
  players: Player[];
  /** Per club: best-XI mean slot OVR in its default formation. */
  xiStrength: Map<number, number>;
}

export interface CheckContext {
  /** Result of generating twice from the same seed (Node only). */
  deterministic?: boolean;
  /** Real club names to look for (Node only: the browser never has them). */
  realNames?: string[];
}

export const THRESHOLDS = {
  clubPlayers: { min: 1612, max: 1860 },
  strength: 1,
  /** Share of senior club players rated 75+ ("few"). */
  elite: { min: 0.01, max: 0.06 },
  /** Share of senior club players rated 50–65 ("many"). */
  core: { min: 0.5 },
  leftFooted: { min: 0.2, max: 0.3 },
  squadCostSlack: 0.005,
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function evaluateWorld(world: WorldLike, context: CheckContext = {}): Check[] {
  const seniors = world.players.filter((p) => p.status === "club");
  const academy = world.players.filter((p) => p.status === "academy");
  const freeAgents = world.players.filter((p) => p.status === "freeAgent");
  const clubPlayers = seniors.length + academy.length;
  const deltas = world.clubs.map((c) =>
    Math.abs((world.xiStrength.get(c.cid) ?? NaN) - c.strengthTarget),
  );
  const worstDelta = Math.max(...deltas);
  const elite = seniors.filter((p) => p.ovr >= 75).length / seniors.length;
  const core = seniors.filter((p) => p.ovr >= 50 && p.ovr <= 65).length / seniors.length;
  const ratios = world.clubSeasons.map((s) => s.squadCostRatio ?? NaN);
  const left = world.players.filter((p) => p.foot === "L").length / world.players.length;
  const serialized = JSON.stringify({
    clubs: world.clubs,
    clubSeasons: world.clubSeasons,
    players: world.players,
  });
  const realNames = context.realNames ?? [];
  const leaked = [
    ...(/"based_on"\s*:/.test(serialized) ? ["the based_on field"] : []),
    ...realNames.filter((name) => serialized.includes(name)),
  ];
  const seniorsPerClub = world.clubs.map((c) => seniors.filter((p) => p.cid === c.cid).length);
  const academyPerClub = world.clubs.map((c) => academy.filter((p) => p.cid === c.cid).length);

  const checks: Check[] = [
    {
      name: "62 clubs",
      pass: world.clubs.length === clubDefinitions.length && clubDefinitions.length === 62,
      detail: `${world.clubs.length}`,
    },
    {
      name: "club players incl. academies ~1,800",
      pass: clubPlayers >= THRESHOLDS.clubPlayers.min && clubPlayers <= THRESHOLDS.clubPlayers.max,
      detail: `${clubPlayers} (range ${THRESHOLDS.clubPlayers.min}-${THRESHOLDS.clubPlayers.max})`,
    },
    {
      name: "22-24 seniors and 4-6 academy players per club",
      pass:
        seniorsPerClub.every((n) => n >= 22 && n <= 24) &&
        academyPerClub.every((n) => n >= 4 && n <= 6),
      detail: `seniors ${Math.min(...seniorsPerClub)}-${Math.max(...seniorsPerClub)}, academy ${Math.min(...academyPerClub)}-${Math.max(...academyPerClub)}`,
    },
    {
      name: "free-agent pool seeded",
      pass: freeAgents.length === FREE_AGENT_POOL_SIZE,
      detail: `${freeAgents.length}`,
    },
    {
      name: "every best XI within ±1 of strength",
      pass: worstDelta <= THRESHOLDS.strength,
      detail: `worst |Δ| ${worstDelta.toFixed(2)}`,
    },
    {
      name: "few players 75+",
      pass: elite >= THRESHOLDS.elite.min && elite <= THRESHOLDS.elite.max,
      detail: `${pct(elite)} (range ${pct(THRESHOLDS.elite.min)}-${pct(THRESHOLDS.elite.max)})`,
    },
    {
      name: "many players 50-65",
      pass: core >= THRESHOLDS.core.min,
      detail: `${pct(core)} (min ${pct(THRESHOLDS.core.min)})`,
    },
    {
      name: "squad cost 50-65% of revenue",
      pass: ratios.every(
        (r) =>
          r >= STARTING_SQUAD_COST.min - THRESHOLDS.squadCostSlack &&
          r <= STARTING_SQUAD_COST.max + THRESHOLDS.squadCostSlack,
      ),
      detail: `${pct(Math.min(...ratios))}-${pct(Math.max(...ratios))}`,
    },
    {
      name: "about a quarter left-footed",
      pass: left >= THRESHOLDS.leftFooted.min && left <= THRESHOLDS.leftFooted.max,
      detail: pct(left),
    },
    {
      name:
        realNames.length > 0 ? "no real club names in the save" : "no based_on field in the save",
      pass: leaked.length === 0,
      detail:
        leaked.length > 0
          ? leaked.join(", ")
          : realNames.length > 0
            ? `${realNames.length} names and the field checked`
            : "checked",
    },
  ];
  if (context.deterministic !== undefined) {
    checks.push({
      name: "same seed gives an identical world",
      pass: context.deterministic,
      detail: context.deterministic ? "identical" : "differs",
    });
  }
  return checks;
}
