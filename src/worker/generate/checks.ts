/**
 * Acceptance checks on a generated world (M1; the Super League's in SL1): used by
 * `pnpm generate --check`, the tests and the inspector page. Counts come from the world's
 * config (roster rules, academies, cap). Thresholds that turn the spec's wording into
 * numbers ("few 75+, many 50–65") are judgment calls, documented in PROGRESS.md; they are
 * Classic's, and the Super League's quality spread is calibrated in SL6.
 */
import { capOf, type DraftConfig } from "../../common/config/competitions";
import type { WorldConfig, WorldId } from "../../common/config/worlds";
import type { Club, ClubSeason, DraftPick, Player } from "../../common/schema";
import { STARTING_SQUAD_COST } from "./contracts";
import { FREE_AGENT_POOL_SIZE, RELEASED_YOUTH_COUNT } from "./freeAgents";
import { OPENING_ACADEMY } from "./squad";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

export interface WorldLike {
  clubs: Club[];
  clubSeasons: ClubSeason[];
  players: Player[];
  /** A world with a draft: the clubs' picks (checked when given). */
  draftPicks?: DraftPick[];
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
  strength: 1,
  leftFooted: { min: 0.2, max: 0.3 },
  squadCostSlack: 0.005,
};

/**
 * The quality spread of senior club players, per world: share rated 75+ ("few") and
 * 50–65 ("many"). Classic's (T, 2026-10-15); the Super League's is set in SL6.
 */
export const WORLD_SHAPE: Partial<
  Record<WorldId, { elite: { min: number; max: number }; core: { min: number } }>
> = {
  classic: { elite: { min: 0.01, max: 0.06 }, core: { min: 0.5 } },
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Each club owns its own pick in every round of the first drafts, once. */
function picksPass(picks: readonly DraftPick[], clubs: number, draft: DraftConfig): boolean {
  const expected = clubs * draft.rounds * (draft.picksAhead + 1);
  const distinct = new Set(picks.map((p) => `${p.season}/${p.round}/${p.originalCid}`));
  return (
    picks.length === expected &&
    distinct.size === expected &&
    picks.every((p) => p.cid === p.originalCid)
  );
}

export function evaluateWorld(
  world: WorldLike,
  config: WorldConfig,
  context: CheckContext = {},
): Check[] {
  const competitions = config.competitions;
  const academies = config.switches.youth === "academy";
  const starting = competitions.rosterRules.startingSeniors;
  const academySize = academies ? OPENING_ACADEMY : { min: 0, max: 0 };
  const clubCount = config.clubs.length;
  const playerRange = {
    min: clubCount * (starting.min + academySize.min),
    max: clubCount * (starting.max + academySize.max),
  };
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

  const about = (n: number) => `~${(Math.round(n / 100) * 100).toLocaleString("en-GB")}`;
  const shape = WORLD_SHAPE[config.id];
  // Mean best-XI strength per tier: every tier above another is stronger on average.
  const tierMeans = [...new Set(competitions.leagues.map((l) => l.tier))].sort().map((tier) => {
    const ids = new Set(competitions.leagues.filter((l) => l.tier === tier).map((l) => l.id));
    const xis = world.clubs
      .filter((c) => ids.has(c.leagueId))
      .map((c) => world.xiStrength.get(c.cid) ?? NaN);
    return xis.reduce((a, b) => a + b, 0) / Math.max(1, xis.length);
  });
  const softCap = competitions.softCap;
  // Each club's payroll as a share of its cap, in a world with one.
  const capShares = softCap
    ? world.clubs.map((c) => {
        const wages = seniors
          .filter((p) => p.cid === c.cid)
          .reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0);
        return wages / (capOf(competitions, c.leagueId) ?? 1);
      })
    : [];

  const checks: Check[] = [
    {
      name: `${clubCount} clubs`,
      pass: world.clubs.length === clubCount,
      detail: `${world.clubs.length}`,
    },
    {
      name: `club players${academies ? " incl. academies" : ""} ${about((playerRange.min + playerRange.max) / 2)}`,
      pass: clubPlayers >= playerRange.min && clubPlayers <= playerRange.max,
      detail: `${clubPlayers} (range ${playerRange.min}-${playerRange.max})`,
    },
    {
      name: academies
        ? `${starting.min}-${starting.max} seniors and ${OPENING_ACADEMY.min}-${OPENING_ACADEMY.max} academy players per club`
        : `${starting.min}-${starting.max} seniors per club, no academies`,
      pass:
        seniorsPerClub.every((n) => n >= starting.min && n <= starting.max) &&
        academyPerClub.every((n) => n >= academySize.min && n <= academySize.max),
      detail: `seniors ${Math.min(...seniorsPerClub)}-${Math.max(...seniorsPerClub)}, academy ${Math.min(...academyPerClub)}-${Math.max(...academyPerClub)}`,
    },
    {
      name: "free-agent pool seeded",
      pass: freeAgents.length === FREE_AGENT_POOL_SIZE + (academies ? RELEASED_YOUTH_COUNT : 0),
      detail: `${freeAgents.length}`,
    },
    ...(competitions.draft
      ? [
          {
            name: `${competitions.draft.classesAhead + 1} draft classes of ${competitions.draft.classSize} prospects`,
            pass:
              world.players.filter((p) => p.status === "prospect").length ===
              (competitions.draft.classesAhead + 1) * competitions.draft.classSize,
            detail: `${world.players.filter((p) => p.status === "prospect").length}`,
          },
          ...(world.draftPicks
            ? [
                {
                  name: `every club's own picks for ${competitions.draft.picksAhead + 1} drafts`,
                  pass: picksPass(world.draftPicks, clubCount, competitions.draft),
                  detail: `${world.draftPicks.length}`,
                },
              ]
            : []),
        ]
      : []),
    {
      name: "every best XI within ±1 of strength",
      pass: worstDelta <= THRESHOLDS.strength,
      detail: `worst |Δ| ${worstDelta.toFixed(2)}`,
    },
    {
      name: "tiers ordered by strength on average",
      pass: tierMeans.every((m, i) => i === 0 || m < (tierMeans[i - 1] ?? -Infinity)),
      detail: tierMeans.map((m) => m.toFixed(1)).join(" > "),
    },
    ...(shape
      ? [
          {
            name: "few players 75+",
            pass: elite >= shape.elite.min && elite <= shape.elite.max,
            detail: `${pct(elite)} (range ${pct(shape.elite.min)}-${pct(shape.elite.max)})`,
          },
          {
            name: "many players 50-65",
            pass: core >= shape.core.min,
            detail: `${pct(core)} (min ${pct(shape.core.min)})`,
          },
        ]
      : []),
    softCap
      ? {
          name: `payroll ${pct(softCap.openingPayroll.min)}-${pct(softCap.openingPayroll.max)} of the club's cap`,
          pass: capShares.every(
            (r) =>
              r >= softCap.openingPayroll.min - THRESHOLDS.squadCostSlack &&
              r <= softCap.openingPayroll.max + THRESHOLDS.squadCostSlack,
          ),
          detail: `${pct(Math.min(...capShares))}-${pct(Math.max(...capShares))}`,
        }
      : {
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
