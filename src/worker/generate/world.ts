/**
 * New-league world generation (MILESTONES M1): every club, squad, contract, free agent
 * and the save's meta rows, as one pure function of the options. Same options (seed
 * included) → identical world. Writing it to IndexedDB is the caller's job.
 */
import type { ClubDefinition } from "../../common/config/clubs";
import { capOf, type CompetitionsConfig, leagueById } from "../../common/config/competitions";
import { formationById, formationsConfig } from "../../common/config/formations";
import type { WorldConfig } from "../../common/config/worlds";
import { exactAge } from "../../common/dates";
import type {
  Club,
  ClubSeason,
  CompetitionRow,
  DraftPick,
  MetaRows,
  Player,
} from "../../common/schema";
import { estimatePotential, type PotentialClubContext } from "../core/potential";
import { Random } from "../core/random";
import { assignContracts, capBill, revenueBill } from "./contracts";
import { commercialBase, expectedTvAndGates, ticketPrice } from "../finance/finance";
import { bornLocally } from "./birthplace";
import { generateFreeAgents, generateReleasedYouth } from "./freeAgents";
import { worldMix } from "./identity";
import { draftClass, missingPicks } from "../season/draft";
import { generateSquad } from "./squad";

/** Bump when generation changes in a way that makes old saves inconsistent. */
export const WORLD_VERSION = 1;
const NEUTRAL_DIAL = 50;
/** Context for free agents' POT: they'd likely land at a second-tier level. */
export const FREE_AGENT_CONTEXT: PotentialClubContext = {
  coachingDial: NEUTRAL_DIAL,
  medicalDial: NEUTRAL_DIAL,
  youthDial: NEUTRAL_DIAL,
  xiStrength: 55,
  levelStrength: 55,
};

export interface WorldOptions {
  /** The world to generate (SPEC §17.1): its clubs and competitions. */
  config: WorldConfig;
  seed: string;
  name: string;
  userCid: number;
  /** ISO date-time stamp for the save (not used for any randomness). */
  createdAt: string;
}

export interface World {
  /** Every meta row except the season state, which the season loop sets up. */
  meta: Omit<MetaRows, "season">;
  competitions: CompetitionRow[];
  clubs: Club[];
  clubSeasons: ClubSeason[];
  players: Player[];
  /** Every club's own picks for its first drafts (a world with a draft; SPEC §17.5). */
  draftPicks: DraftPick[];
  /** Per club: best-XI mean slot OVR in its default formation (for reports/tests). */
  xiStrength: Map<number, number>;
}

function competitionRows(config: CompetitionsConfig): CompetitionRow[] {
  const promotedFrom = new Map(
    config.leagues.filter((l) => l.relegation).map((l) => [l.relegation?.to as string, l.id]),
  );
  return [
    ...config.leagues.map((l) => ({
      id: l.id,
      type: "league" as const,
      country: l.country,
      name: l.name,
      tier: l.tier,
      relegationTo: l.relegation?.to ?? null,
      promotionTo: promotedFrom.get(l.id) ?? null,
    })),
    ...config.cups.map((c) => ({
      id: c.id,
      type: "cup" as const,
      country: c.country,
      name: c.name,
      tier: null,
      relegationTo: null,
      promotionTo: null,
    })),
  ];
}

function clubRow(
  rng: Random,
  def: ClubDefinition,
  cid: number,
  formation: string,
  config: CompetitionsConfig,
): Club {
  return {
    cid,
    code: def.code,
    name: def.name,
    short: def.short,
    abbr: def.abbr,
    city: def.city,
    country: def.country,
    capacity: def.capacity,
    colors: def.colors,
    market: def.market,
    crest: def.crest,
    leagueId: def.league,
    revenueAnchor: def.revenue,
    strengthTarget: def.strength,
    tactics: { formation, sliders: { mentality: 0, pressing: 0, directness: 0 } },
    budget: {
      coaching: NEUTRAL_DIAL,
      youth: NEUTRAL_DIAL,
      medical: NEUTRAL_DIAL,
      facilities: NEUTRAL_DIAL,
    },
    ticketPrice: ticketPrice(def.reputation, leagueById(config, def.league)),
    cash: Math.round(def.revenue * rng.real(0.08, 0.25)),
    // Commercial income set so season-1 revenue lands near the anchor (src/worker/finance).
    commercial: {
      base: commercialBase(
        def.revenue,
        expectedTvAndGates(
          { capacity: def.capacity, market: def.market, leagueId: def.league },
          def.reputation,
          openingHype(def),
          config,
        ),
      ),
      reputation: def.reputation,
    },
  };
}

/** The opening squad's bill: from the club's cap in a world with one, else its revenue. */
function openingBill(rng: Random, def: ClubDefinition, competitions: CompetitionsConfig) {
  const cap = capOf(competitions, def.league);
  return cap !== null && competitions.softCap
    ? capBill(rng, cap, competitions.softCap.openingPayroll)
    : revenueBill(rng, def.revenue);
}

const openingHype = (def: ClubDefinition) => Math.round(50 + (def.reputation - 50) * 0.4);

function clubSeasonRow(def: ClubDefinition, cid: number, season: number): ClubSeason {
  return {
    cid,
    season,
    leagueId: def.league,
    hype: openingHype(def),
    reputation: def.reputation,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    finish: null,
    revenue: {},
    expenses: {},
    cashEnd: null,
    boardExpectation: null,
    boardConfidence: null,
    squadCostRatio: null,
    budgetBase: def.revenue,
  };
}

export function generateWorld(options: WorldOptions): World {
  const { clubs: definitions, competitions, switches } = options.config;
  const mix = worldMix(options.config);
  const academies = switches.youth === "academy";
  const root = Random.fromSeed(options.seed);
  const season = competitions.firstSeason;
  const seasonStart = competitions.seasonStart;
  if (!definitions[options.userCid]) throw new Error(`Unknown club ${options.userCid}`);

  let pid = 1;
  const nextPid = () => pid++;
  const clubs: Club[] = [];
  const clubSeasons: ClubSeason[] = [];
  const players: Player[] = [];
  const xiStrength = new Map<number, number>();
  const contextByCid = new Map<number, PotentialClubContext>();

  const leagueStrength = new Map<string, number>();
  for (const league of competitions.leagues) {
    const members = definitions.filter((c) => c.league === league.id);
    leagueStrength.set(league.id, members.reduce((s, c) => s + c.strength, 0) / members.length);
  }

  const formationIds = Object.keys(formationsConfig.defaultFormationWeights);
  definitions.forEach((def, cid) => {
    const rng = root.fork(`club:${def.code}`);
    const formationId = rng.weighted(
      formationIds,
      (id) => formationsConfig.defaultFormationWeights[id] ?? 0,
    );
    const squad = generateSquad(rng, {
      club: def,
      cid,
      formation: formationById(formationId),
      season,
      seasonStart,
      nextPid,
      rules: competitions.rosterRules,
      worldMix: mix,
      academies,
    });
    const ages = new Map(
      squad.seniors.map((p) => [p.pid, Math.floor(exactAge(p.birthDate, seasonStart))]),
    );
    const { squadCostRatio } = assignContracts(
      rng,
      squad.seniors,
      ages,
      def.strength,
      def.revenue,
      seasonStart,
      openingBill(rng, def, competitions),
    );

    const club = clubRow(rng, def, cid, formationId, competitions);
    const clubSeason = clubSeasonRow(def, cid, season);
    clubSeason.squadCostRatio = squadCostRatio;
    clubs.push(club);
    clubSeasons.push(clubSeason);
    players.push(...squad.seniors, ...squad.academy);
    xiStrength.set(cid, squad.xi.meanOvr);
    contextByCid.set(cid, {
      coachingDial: club.budget.coaching,
      medicalDial: club.budget.medical,
      youthDial: club.budget.youth,
      xiStrength: squad.xi.meanOvr,
      levelStrength: leagueStrength.get(def.league) ?? squad.xi.meanOvr,
    });
  });

  players.push(...generateFreeAgents(root.fork("freeAgents"), season, seasonStart, nextPid, mix));
  // A world with a draft starts with its first drafts' classes (SPEC §17.5: three visible).
  const ahead = competitions.draft?.classesAhead ?? -1;
  const classSetup = { config: options.config, seed: options.seed, nextPid };
  for (let s = season; s <= season + ahead; s++) {
    players.push(...draftClass(classSetup, s, seasonStart));
  }
  // Academies release their 18-year-olds into free agency; a world without them doesn't.
  if (academies) {
    players.push(
      ...generateReleasedYouth(
        root.fork("releasedYouth"),
        season,
        seasonStart,
        nextPid,
        competitions.leagues,
        mix,
      ),
    );
  }

  for (const player of players) {
    const ratings = player.ratingsHistory[0]?.ratings ?? [];
    const context = player.cid === null ? FREE_AGENT_CONTEXT : contextByCid.get(player.cid);
    if (!context) throw new Error(`No club context for player ${player.pid}`);
    player.pot = estimatePotential(
      {
        ratings,
        position: player.position,
        age: exactAge(player.birthDate, seasonStart),
        curve: player.hidden.curve,
        ceiling: player.hidden.ceiling,
        academy: player.status === "academy",
        club: context,
      },
      root.fork(`pot:${player.pid}`),
    );
    const entry = player.ratingsHistory[0];
    if (entry) entry.pot = player.pot;
  }

  // Local lads: about half of each academy's home-country players (own stream per player).
  bornLocally(options.seed, players, new Map(clubs.map((c) => [c.cid, c])));

  const meta: World["meta"] = {
    game: {
      name: options.name,
      seed: options.seed,
      createdAt: options.createdAt,
      season,
      phase: "preseason",
      date: seasonStart,
      userCid: options.userCid,
      createdWithVersion: WORLD_VERSION,
      injuriesSince: seasonStart,
    },
    ids: { pid, fid: 1, oid: 1, xid: 1, mid: 1, aid: 1 },
    rng: root.getState(),
    world: {
      id: options.config.id,
      leagues: competitions.leagues.map((l) => l.id),
      styleModifiers: Object.fromEntries(competitions.leagues.map((l) => [l.id, l.styleModifiers])),
    },
  };

  return {
    meta,
    competitions: competitionRows(competitions),
    clubs,
    clubSeasons,
    players,
    draftPicks: competitions.draft ? missingPicks(competitions.draft, clubs, [], season) : [],
    xiStrength,
  };
}
