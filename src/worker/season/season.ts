/**
 * One season's competitions (SPEC §2.1): league fixtures, cup draws round by round,
 * promotion play-offs, and the season's outcome (tables, winners, promotion and
 * relegation).
 *
 * The state is plain data so it can be saved and resumed. League fixtures are created
 * at the start; each cup round is drawn once the previous round is complete; play-offs
 * are created once the league is complete, stage by stage. Matches themselves are
 * played by a `PlayFixture` function the caller supplies, so lineups, rotation and
 * fatigue can change without touching this module.
 */
import type {
  CompetitionsConfig,
  CupConfig,
  LeagueConfig,
  StyleModifiers,
} from "../../common/config/competitions";
import type { Club, Fixture, SeasonMeta } from "../../common/schema";
import { Random } from "../core/random";
import type { KnockoutRules, MatchResult } from "../engine/types";
import { seasonCalendar, type SeasonCalendar } from "../schedule/calendar";
import { leagueFixtures } from "../schedule/fixtures";
import { leagueTable, type TableRow } from "../schedule/standings";

/** League style used where clubs of different leagues meet (cups). */
export const NEUTRAL_STYLE: StyleModifiers = { chanceQuality: 1, foulRate: 1, directness: 0 };

/** Fixture competition ID of a league's promotion play-offs. */
export const playoffId = (leagueId: string): string => `${leagueId}-PO`;

export interface LastFinish {
  leagueId: string;
  position: number;
}

export interface SeasonSetup {
  season: number;
  /** The save's seed: every draw and fixture list derives its stream from it. */
  seed: string;
  /** All clubs, each in the league it plays this season. */
  clubs: readonly Club[];
  /** Last season's final league position per club; empty in the first season. */
  lastFinish: ReadonlyMap<number, LastFinish>;
  /** First fixture ID to use. */
  firstFid: number;
  config: CompetitionsConfig;
}

export interface SeasonState {
  season: number;
  seed: string;
  calendar: SeasonCalendar;
  /** Clubs per league for this season, fixed at the start. */
  leagueClubs: Record<string, number[]>;
  /** Per cup: the clubs entering each round (0-based), fixed at the start. */
  cupEntrants: Record<string, number[][]>;
  /** Per cup: the clubs in each round drawn so far (byes included). */
  cupParticipants: Record<string, number[][]>;
  fixtures: Fixture[];
  nextFid: number;
  /** TV merit money for this season has been paid. */
  meritPaid?: boolean;
}

/** The saved part of a season's state (fixtures are saved in their own store). */
export function seasonMetaOf(state: SeasonState): Omit<SeasonMeta, "movesApplied"> {
  return {
    season: state.season,
    leagueClubs: state.leagueClubs,
    cupEntrants: state.cupEntrants,
    cupParticipants: state.cupParticipants,
    meritPaid: state.meritPaid ?? false,
  };
}

/** Rebuilds a season's state from its saved meta row and fixtures. */
export function restoreSeason(
  meta: Omit<SeasonMeta, "movesApplied">,
  seed: string,
  fixtures: Fixture[],
  nextFid: number,
  config: CompetitionsConfig,
): SeasonState {
  return {
    season: meta.season,
    seed,
    calendar: seasonCalendar(meta.season, config),
    leagueClubs: meta.leagueClubs,
    cupEntrants: meta.cupEntrants,
    cupParticipants: meta.cupParticipants,
    fixtures: [...fixtures].sort((a, b) => a.fid - b.fid),
    nextFid,
    meritPaid: meta.meritPaid ?? false,
  };
}

/** What the engine needs to know about a fixture besides the two squads. */
export interface FixtureSetup {
  seed: string;
  style: StyleModifiers;
  neutral: boolean;
  knockout: KnockoutRules | null;
}

export type PlayFixture = (fixture: Fixture, setup: FixtureSetup) => MatchResult;

const leagueOf = (config: CompetitionsConfig, id: string): LeagueConfig | undefined =>
  config.leagues.find((l) => l.id === id);
/** The `count` entrants with the lowest last-season finish (season 1: lowest strength). */
function lowestPlaced(
  clubs: readonly Club[],
  count: number,
  lastFinish: ReadonlyMap<number, LastFinish>,
  config: CompetitionsConfig,
): number[] {
  // Higher rank = lower placed: a lower tier beats any place in a higher tier, and a club
  // without a finish (season 1, or new to these leagues) counts as lowest of all.
  const rank = (club: Club): number => {
    const last = lastFinish.get(club.cid);
    if (!last) return Infinity;
    return (leagueOf(config, last.leagueId)?.tier ?? 99) * 1000 + last.position;
  };
  return [...clubs]
    .sort((a, b) => rank(b) - rank(a) || a.strengthTarget - b.strengthTarget || a.cid - b.cid)
    .slice(0, count)
    .map((c) => c.cid);
}

function cupEntrantsByRound(
  cup: CupConfig,
  clubs: readonly Club[],
  lastFinish: ReadonlyMap<number, LastFinish>,
  config: CompetitionsConfig,
): number[][] {
  const rounds = cup.rounds.map((): number[] => []);
  const entrants = clubs.filter((c) => cup.entrants.includes(c.leagueId));
  if (cup.preliminary) {
    const qualifiers = new Set(lowestPlaced(entrants, cup.preliminary.clubs, lastFinish, config));
    for (const club of entrants)
      (rounds[qualifiers.has(club.cid) ? 0 : 1] as number[]).push(club.cid);
  } else {
    for (const club of entrants)
      (rounds[cup.entryRound[club.leagueId] ?? 0] as number[]).push(club.cid);
  }
  return rounds;
}

function newFixture(state: SeasonState, f: Omit<Fixture, "fid" | "season" | "result">): Fixture {
  const fixture: Fixture = { fid: state.nextFid++, season: state.season, result: null, ...f };
  state.fixtures.push(fixture);
  return fixture;
}

/** Draws cup round `round` from `participants` (first drawn at home; an odd one out has a bye). */
function drawCupRound(state: SeasonState, cup: CupConfig, round: number, participants: number[]) {
  const date = state.calendar.cups[cup.id]?.[round];
  if (!date) throw new Error(`${cup.id}: no date for round ${round + 1}`);
  (state.cupParticipants[cup.id] ??= [])[round] = participants;
  const drawn = Random.fromSeed(`${state.seed}/draw/${cup.id}/${state.season}/${round}`).shuffle(
    participants,
  );
  const final = round === cup.rounds.length - 1;
  for (let i = 0; i + 1 < drawn.length; i += 2) {
    newFixture(state, {
      date: date.date,
      slot: date.slot,
      competition: cup.id,
      round: date.round,
      homeCid: drawn[i] as number,
      awayCid: drawn[i + 1] as number,
      neutral: final,
      leg: null,
    });
  }
}

/** Starts a season: the calendar, all league fixtures, and the first round of every cup. */
export function createSeason(setup: SeasonSetup): SeasonState {
  const config = setup.config;
  const state: SeasonState = {
    season: setup.season,
    seed: setup.seed,
    calendar: seasonCalendar(setup.season, config),
    leagueClubs: {},
    cupEntrants: {},
    cupParticipants: {},
    fixtures: [],
    nextFid: setup.firstFid,
  };
  for (const league of config.leagues) {
    const cids = setup.clubs.filter((c) => c.leagueId === league.id).map((c) => c.cid);
    if (cids.length !== league.clubs) {
      throw new Error(`${league.id} has ${cids.length} clubs, expected ${league.clubs}`);
    }
    state.leagueClubs[league.id] = cids;
    state.fixtures.push(
      ...leagueFixtures(
        league.id,
        setup.season,
        cids,
        state.calendar.leagues[league.id] ?? [],
        Random.fromSeed(`${setup.seed}/fixtures/${league.id}/${setup.season}`),
        () => state.nextFid++,
      ),
    );
  }
  for (const cup of config.cups) {
    const entrants = cupEntrantsByRound(cup, setup.clubs, setup.lastFinish, config);
    state.cupEntrants[cup.id] = entrants;
    drawCupRound(state, cup, 0, entrants[0] ?? []);
  }
  return state;
}

const played = (fixtures: readonly Fixture[]) => fixtures.every((f) => f.result !== null);

/** Fixtures of one competition (and round, if given). */
function fixturesOf(state: SeasonState, competition: string, round?: string): Fixture[] {
  return state.fixtures.filter(
    (f) => f.competition === competition && (round === undefined || f.round === round),
  );
}

/** Knockout winners of a set of ties: the single match's winner, or the second leg's. */
const winnersOf = (fixtures: readonly Fixture[]): number[] =>
  fixtures.filter((f) => f.leg !== 1).map((f) => f.result?.winnerCid as number);

export function leagueTableOf(state: SeasonState, leagueId: string, config: CompetitionsConfig) {
  const league = leagueOf(config, leagueId);
  if (!league) throw new Error(`Unknown league ${leagueId}`);
  return leagueTable(state.leagueClubs[leagueId] ?? [], fixturesOf(state, leagueId), {
    tieBreakers: league.tieBreakers,
    drawSeed: `${state.seed}/table/${leagueId}/${state.season}`,
  });
}

function progressCup(state: SeasonState, cup: CupConfig): boolean {
  const drawnRounds = state.cupParticipants[cup.id]?.length ?? 0;
  const current = drawnRounds - 1;
  if (current < 0 || current >= cup.rounds.length - 1) return false;
  const roundName = cup.rounds[current] as string;
  const ties = fixturesOf(state, cup.id, roundName);
  if (!played(ties)) return false;
  const inTies = new Set(ties.flatMap((f) => [f.homeCid, f.awayCid]));
  const byes = (state.cupParticipants[cup.id]?.[current] ?? []).filter((c) => !inTies.has(c));
  const next = [...winnersOf(ties), ...byes, ...(state.cupEntrants[cup.id]?.[current + 1] ?? [])];
  drawCupRound(state, cup, current + 1, next);
  return true;
}

function progressPlayoffs(
  state: SeasonState,
  league: LeagueConfig,
  config: CompetitionsConfig,
): boolean {
  const format = league.playoff;
  const dates = state.calendar.playoffs[league.id];
  if (!format || !dates) return false;
  const id = playoffId(league.id);
  const po = fixturesOf(state, id);
  if (!played(po)) return false;
  if (po.length === 0 && !played(fixturesOf(state, league.id))) return false;
  const next = format.rounds.findIndex((r) => !po.some((f) => f.round === r.name));
  const round = format.rounds[next];
  if (!round) return false;

  // Seed = final league position (lower is better).
  const table = leagueTableOf(state, league.id, config);
  const at = (pos: number) => table[pos - 1]?.cid as number;
  const seedOf = (cid: number) => table.find((r) => r.cid === cid)?.position ?? 99;
  const bySeed = (a: number, b: number) => seedOf(a) - seedOf(b);
  const before = format.rounds[next - 1];
  // Last round's winners, tie by tie in the order the ties were made.
  const winners = before ? winnersOf(po.filter((f) => f.round === before.name)) : [];

  // Each tie as [better placed, worse placed].
  let ties: [number, number][];
  if (typeof round.pairing === "object") {
    ties = round.pairing.ties.map(([a, b]) => [at(a), at(b)].sort(bySeed) as [number, number]);
  } else if (round.pairing === "bracket") {
    ties = [];
    for (let i = 0; i + 1 < winners.length; i += 2) {
      ties.push([winners[i] as number, winners[i + 1] as number].sort(bySeed) as [number, number]);
    }
  } else {
    const clubs = [...round.entrants.map(at), ...winners].sort(bySeed);
    ties = clubs
      .slice(0, clubs.length / 2)
      .map((club, i) => [club, clubs[clubs.length - 1 - i] as number]);
  }

  for (const [high, low] of ties) {
    const legs: (1 | 2 | null)[] = round.legs === 2 ? [1, 2] : [null];
    for (const leg of legs) {
      const d = dates.find((r) => r.round === round.name && r.leg === leg);
      if (!d) throw new Error(`${id}: no date for ${round.name}`);
      // The better-placed club hosts a single match and a tie's second leg.
      const [home, away] = leg === 1 ? [low, high] : [high, low];
      newFixture(state, {
        date: d.date,
        slot: d.slot,
        competition: id,
        round: round.name,
        homeCid: home,
        awayCid: away,
        neutral: round.neutral,
        leg,
      });
    }
  }
  return true;
}

/** Creates any fixtures that became due (next cup rounds, play-off stages). */
export function progress(state: SeasonState, config: CompetitionsConfig) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const cup of config.cups) changed = progressCup(state, cup) || changed;
    for (const league of config.leagues)
      changed = progressPlayoffs(state, league, config) || changed;
  }
}

/** Knockout rules for a fixture: none in leagues and first legs; else extra time and penalties. */
export function knockoutRules(state: SeasonState, fixture: Fixture): KnockoutRules | null {
  if (fixture.leg === 1) return null;
  const isLeague = state.leagueClubs[fixture.competition] !== undefined;
  if (isLeague) return null;
  if (fixture.leg === 2) {
    const first = state.fixtures.find(
      (f) =>
        f.competition === fixture.competition &&
        f.round === fixture.round &&
        f.leg === 1 &&
        f.homeCid === fixture.awayCid &&
        f.awayCid === fixture.homeCid,
    );
    if (!first?.result) throw new Error(`Second leg ${fixture.fid} has no played first leg`);
    // From this match's home team's point of view.
    return {
      extraTime: true,
      penalties: true,
      firstLeg: { home: first.result.awayGoals, away: first.result.homeGoals },
    };
  }
  return { extraTime: true, penalties: true, firstLeg: null };
}

/** League style for a fixture: its league's (or play-off league's); neutral across leagues. */
export function fixtureStyle(
  state: SeasonState,
  fixture: Fixture,
  config: CompetitionsConfig,
): StyleModifiers {
  const leagueId =
    leagueOf(config, fixture.competition)?.id ??
    config.leagues.find((l) => playoffId(l.id) === fixture.competition)?.id ??
    Object.keys(state.leagueClubs).find(
      (id) =>
        state.leagueClubs[id]?.includes(fixture.homeCid) &&
        state.leagueClubs[id]?.includes(fixture.awayCid),
    );
  return leagueId ? (leagueOf(config, leagueId)?.styleModifiers ?? NEUTRAL_STYLE) : NEUTRAL_STYLE;
}

export function recordResult(fixture: Fixture, result: MatchResult): void {
  fixture.result = {
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    extraTime: result.extraTime,
    penalties: result.penalties,
    winnerCid:
      result.winner === null ? null : result.winner === 0 ? fixture.homeCid : fixture.awayCid,
  };
}

/** Date of the next unplayed fixture, or null when the season's matches are over. */
export function nextMatchDate(state: SeasonState): string | null {
  let next: string | null = null;
  for (const f of state.fixtures) if (!f.result && (next === null || f.date < next)) next = f.date;
  return next;
}

/** Plays every fixture on `date`, then creates whatever became due. */
export function playDate(
  state: SeasonState,
  date: string,
  play: PlayFixture,
  config: CompetitionsConfig,
): Fixture[] {
  const today = state.fixtures.filter((f) => f.date === date && !f.result);
  for (const fixture of today) {
    const result = play(fixture, fixtureSetup(state, fixture, config));
    recordResult(fixture, result);
  }
  progress(state, config);
  return today;
}

/** How a fixture is played: its random stream, league style, venue and knockout rules. */
export function fixtureSetup(
  state: SeasonState,
  fixture: Fixture,
  config: CompetitionsConfig,
): FixtureSetup {
  return {
    seed: `${state.seed}/match:${fixture.fid}`,
    style: fixtureStyle(state, fixture, config),
    neutral: fixture.neutral,
    knockout: knockoutRules(state, fixture),
  };
}

/** Plays the rest of the season. */
export function playRest(state: SeasonState, play: PlayFixture, config: CompetitionsConfig) {
  for (let date = nextMatchDate(state); date !== null; date = nextMatchDate(state)) {
    playDate(state, date, play, config);
  }
}

export interface ClubMove {
  cid: number;
  from: string;
  to: string;
  reason: "promoted" | "playoffs" | "relegated";
}

export interface SeasonOutcome {
  tables: Record<string, TableRow[]>;
  /** Each league's champion: its table winner, or where a play-off decides the title its winner. */
  champions: Record<string, number>;
  /**
   * Where a play-off decides the title (the Super League's Star, SPEC §17.2): the table
   * winner, recorded but not a title. Absent in a world without such a play-off.
   */
  tableWinners?: Record<string, number>;
  cupWinners: Record<string, number>;
  playoffWinners: Record<string, number[]>;
  moves: ClubMove[];
}

/** The season's results once every match is played (throws before that). */
export function seasonOutcome(state: SeasonState, config: CompetitionsConfig): SeasonOutcome {
  if (nextMatchDate(state) !== null) throw new Error("The season still has matches to play");
  const tables: Record<string, TableRow[]> = {};
  const champions: Record<string, number> = {};
  const cupWinners: Record<string, number> = {};
  const playoffWinners: Record<string, number[]> = {};
  const tableWinners: Record<string, number> = {};
  const moves: ClubMove[] = [];
  for (const league of config.leagues) {
    const table = leagueTableOf(state, league.id, config);
    tables[league.id] = table;
    champions[league.id] = table[0]?.cid as number;
    if (league.relegation) {
      for (const row of table.slice(-league.relegation.places)) {
        moves.push({
          cid: row.cid,
          from: league.id,
          to: league.relegation.to,
          reason: "relegated",
        });
      }
    }
    if (league.promotion) {
      for (const row of table.slice(0, league.promotion.automatic)) {
        moves.push({ cid: row.cid, from: league.id, to: league.promotion.to, reason: "promoted" });
      }
    }
    const playoff = league.playoff;
    if (playoff) {
      const final = playoff.rounds.at(-1)?.name ?? "";
      const winners = winnersOf(fixturesOf(state, playoffId(league.id), final));
      playoffWinners[league.id] = winners;
      if (playoff.decides === "promotion" && league.promotion) {
        for (const cid of winners) {
          moves.push({ cid, from: league.id, to: league.promotion.to, reason: "playoffs" });
        }
      }
      if (playoff.decides === "title" && winners[0] !== undefined) {
        tableWinners[league.id] = champions[league.id] as number;
        champions[league.id] = winners[0];
      }
    }
  }
  for (const cup of config.cups) {
    const final = fixturesOf(state, cup.id, cup.rounds[cup.rounds.length - 1]);
    cupWinners[cup.id] = winnersOf(final)[0] as number;
  }
  const titles = Object.keys(tableWinners).length > 0 ? { tableWinners } : {};
  return { tables, champions, ...titles, cupWinners, playoffWinners, moves };
}

/** Last-season finishes for the next season's setup (cup preliminary rounds). */
export function finishesOf(outcome: SeasonOutcome): Map<number, LastFinish> {
  const out = new Map<number, LastFinish>();
  for (const [leagueId, table] of Object.entries(outcome.tables)) {
    for (const row of table) out.set(row.cid, { leagueId, position: row.position });
  }
  return out;
}

/** Moves promoted and relegated clubs to their new leagues (mutates the clubs). */
export function applyMoves(clubs: Club[], moves: readonly ClubMove[]): void {
  const byCid = new Map(clubs.map((c) => [c.cid, c]));
  for (const move of moves) {
    const club = byCid.get(move.cid);
    if (club) club.leagueId = move.to;
  }
}
