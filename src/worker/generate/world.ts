/**
 * New-league world generation (MILESTONES M1): every club, squad, contract, free agent
 * and the save's meta rows, as one pure function of the options. Same options (seed
 * included) → identical world. Writing it to IndexedDB is the caller's job.
 */
import { clubDefinitions, type ClubDefinition } from "../../common/config/clubs";
import { competitionsConfig } from "../../common/config/competitions";
import { formationById, formationsConfig } from "../../common/config/formations";
import { exactAge } from "../../common/dates";
import type { Club, ClubSeason, CompetitionRow, MetaRows, Player } from "../../common/schema";
import { estimatePotential, type PotentialClubContext } from "../core/potential";
import { Random } from "../core/random";
import { assignContracts } from "./contracts";
import { generateFreeAgents } from "./freeAgents";
import { generateSquad } from "./squad";

/** Bump when generation changes in a way that makes old saves inconsistent. */
export const WORLD_VERSION = 1;
const NEUTRAL_DIAL = 50;
/** Context for free agents' POT: they'd likely land at a second-tier level. */
const FREE_AGENT_CONTEXT: PotentialClubContext = {
  coachingDial: NEUTRAL_DIAL,
  medicalDial: NEUTRAL_DIAL,
  youthDial: NEUTRAL_DIAL,
  xiStrength: 55,
  levelStrength: 55,
};

export interface WorldOptions {
  seed: string;
  name: string;
  userCid: number;
  /** ISO date-time stamp for the save (not used for any randomness). */
  createdAt: string;
}

export interface World {
  meta: MetaRows;
  competitions: CompetitionRow[];
  clubs: Club[];
  clubSeasons: ClubSeason[];
  players: Player[];
  /** Per club: best-XI mean slot OVR in its default formation (for reports/tests). */
  xiStrength: Map<number, number>;
}

function competitionRows(): CompetitionRow[] {
  const promotedFrom = new Map(
    competitionsConfig.leagues
      .filter((l) => l.relegation)
      .map((l) => [l.relegation?.to as string, l.id]),
  );
  return [
    ...competitionsConfig.leagues.map((l) => ({
      id: l.id,
      type: "league" as const,
      country: l.country,
      name: l.name,
      tier: l.tier,
      relegationTo: l.relegation?.to ?? null,
      promotionTo: promotedFrom.get(l.id) ?? null,
    })),
    ...competitionsConfig.cups.map((c) => ({
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

function clubRow(rng: Random, def: ClubDefinition, cid: number, formation: string): Club {
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
    // Provisional until the economy milestone (M4).
    ticketPrice: Math.round(20 + 0.6 * def.market),
    cash: Math.round(def.revenue * rng.real(0.08, 0.25)),
  };
}

function clubSeasonRow(def: ClubDefinition, cid: number, season: number): ClubSeason {
  return {
    cid,
    season,
    leagueId: def.league,
    hype: Math.round(50 + (def.reputation - 50) * 0.4),
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
  };
}

export function generateWorld(options: WorldOptions): World {
  const root = Random.fromSeed(options.seed);
  const season = competitionsConfig.firstSeason;
  const seasonStart = competitionsConfig.seasonStart;
  if (!clubDefinitions[options.userCid]) throw new Error(`Unknown club ${options.userCid}`);

  let pid = 1;
  const nextPid = () => pid++;
  const clubs: Club[] = [];
  const clubSeasons: ClubSeason[] = [];
  const players: Player[] = [];
  const xiStrength = new Map<number, number>();
  const contextByCid = new Map<number, PotentialClubContext>();

  const leagueStrength = new Map<string, number>();
  for (const league of competitionsConfig.leagues) {
    const members = clubDefinitions.filter((c) => c.league === league.id);
    leagueStrength.set(league.id, members.reduce((s, c) => s + c.strength, 0) / members.length);
  }

  const formationIds = Object.keys(formationsConfig.defaultFormationWeights);
  clubDefinitions.forEach((def, cid) => {
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
    );

    const club = clubRow(rng, def, cid, formationId);
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

  players.push(...generateFreeAgents(root.fork("freeAgents"), season, seasonStart, nextPid));

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

  const meta: MetaRows = {
    game: {
      name: options.name,
      seed: options.seed,
      createdAt: options.createdAt,
      season,
      phase: "preseason",
      date: seasonStart,
      userCid: options.userCid,
      createdWithVersion: WORLD_VERSION,
    },
    ids: { pid, fid: 1, oid: 1, xid: 1, mid: 1, aid: 1 },
    rng: root.getState(),
    world: {
      leagues: competitionsConfig.leagues.map((l) => l.id),
      styleModifiers: Object.fromEntries(
        competitionsConfig.leagues.map((l) => [l.id, l.styleModifiers]),
      ),
    },
  };

  return { meta, competitions: competitionRows(), clubs, clubSeasons, players, xiStrength };
}
