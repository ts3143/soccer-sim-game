/**
 * League and cup pages (M5, SPEC §11): Standings (with zones; past seasons from their
 * final rows), Cups and play-offs (rounds of ties, two-legged ties together), and the
 * Weekly Schedule (every competition's fixtures, Monday to Sunday).
 */
import type {
  CupTie,
  CupView,
  FormResult,
  ScheduleView,
  StandingsRow,
  StandingsView,
  TableZone,
} from "../../common/api";
import { competitionsConfig } from "../../common/config/competitions";
import { addDays } from "../../common/dates";
import type { Club, Fixture, GameMeta } from "../../common/schema";
import { openLeague } from "../league/session";
import { PLAYOFF_ROUNDS } from "../schedule/calendar";
import { playoffId } from "../season/season";
import {
  formOf,
  leagueTables,
  matchView,
  resultFor,
  seasonFixtures,
  seasonRows,
  teamRef,
} from "./common";

const ZONE_LABELS: Record<Exclude<TableZone, null>, string> = {
  champions: "Champions",
  promoted: "Promotion",
  playoffs: "Play-offs",
  relegated: "Relegation",
};

/** The zone of a final position under a league's rules. */
function zoneOf(leagueId: string, position: number, clubs: number): TableZone {
  const league = competitionsConfig.leagues.find((l) => l.id === leagueId);
  if (!league) return null;
  if (position === 1) return "champions";
  if (league.promotion && position <= league.promotion.automatic) return "promoted";
  if (league.promotion?.playoffPositions.includes(position)) return "playoffs";
  if (league.relegation && position > clubs - league.relegation.places) return "relegated";
  return null;
}

const record = (fixtures: readonly Fixture[], cid: number, home: boolean): string => {
  const own = fixtures.filter((f) => f.result && (home ? f.homeCid : f.awayCid) === cid);
  const count = (r: FormResult) => own.filter((f) => resultFor(f, cid) === r).length;
  return `${count("W")}-${count("D")}-${count("L")}`;
};

export async function getStandings(
  lid: number,
  leagueId: string | null,
  season: number | null,
): Promise<StandingsView> {
  const session = await openLeague(lid);
  const { cache } = session;
  const game = cache.get("meta", "game") as GameMeta;
  const user = cache.get("clubs", game.userCid);
  const s = season ?? game.season;
  const id = leagueId ?? user?.leagueId ?? competitionsConfig.leagues[0]?.id ?? "";
  const league = competitionsConfig.leagues.find((l) => l.id === id);
  if (!league) throw new Error(`No league ${id}`);
  const clubs = new Map(cache.getAll("clubs").map((c) => [c.cid, c]));
  let rows: StandingsRow[];
  const notes: string[] = [];

  if (s === game.season) {
    const fixtures = seasonFixtures(session, s);
    const own = fixtures.filter((f) => f.competition === id);
    rows = (leagueTables(session, fixtures).find((t) => t.id === id)?.rows ?? []).map((r) => ({
      ...r,
      form: formOf(own, r.cid),
      home: record(own, r.cid, true),
      away: record(own, r.cid, false),
    }));
  } else {
    const finished = cache
      .getAll("clubSeasons")
      .filter((r) => r.season === s && r.leagueId === id)
      .sort((a, b) => (a.finish ?? 99) - (b.finish ?? 99));
    rows = finished.map((r, i) => {
      const position = r.finish ?? i + 1;
      return {
        ...teamRef(clubs.get(r.cid)),
        position,
        played: r.won + r.drawn + r.lost,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        goalDifference: r.goalsFor - r.goalsAgainst,
        points: r.points,
        zone: zoneOf(id, position, finished.length),
        form: null,
        home: null,
        away: null,
      };
    });
    const awards = await seasonRows(session, "awards", s);
    const names = (type: string, competition = id) =>
      awards
        .filter((a) => a.type === type && a.competition === competition)
        .map((a) => clubs.get(a.cid ?? -1)?.name ?? a.name);
    const champion = names("champions");
    if (champion.length) notes.push(`Champions: ${champion.join(", ")}`);
    const promoted = names("promoted");
    if (promoted.length) notes.push(`Promoted: ${promoted.join(", ")}`);
    const playoff = names("playoffWinner", playoffId(id));
    if (playoff.length) notes.push(`Play-off winners: ${playoff.join(", ")}`);
    const relegated = names("relegated");
    if (relegated.length) notes.push(`Relegated: ${relegated.join(", ")}`);
  }

  const zones = (Object.keys(ZONE_LABELS) as Exclude<TableZone, null>[])
    .filter((z) => rows.some((r) => r.zone === z))
    .map((zone) => ({ zone, label: ZONE_LABELS[zone] }));
  return {
    leagueId: id,
    leagueName: league.name,
    season: s,
    current: s === game.season,
    rows,
    zones,
    notes,
  };
}

/** Every knockout competition: the cups, then each league's play-offs. */
function knockouts(): { id: string; name: string; rounds: string[] }[] {
  return [
    ...competitionsConfig.cups.map((c) => ({ id: c.id, name: c.name, rounds: c.rounds })),
    ...competitionsConfig.leagues
      .filter((l) => l.promotion && l.promotion.playoffPositions.length > 0)
      .map((l) => ({
        id: playoffId(l.id),
        name: `${l.name} play-offs`,
        rounds: [
          ...(l.promotion?.playoffPositions.length === 6 ? [PLAYOFF_ROUNDS.eliminators] : []),
          PLAYOFF_ROUNDS.semis,
          PLAYOFF_ROUNDS.final,
        ],
      })),
  ];
}

export async function getCups(
  lid: number,
  competition: string | null,
  season: number | null,
): Promise<CupView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const all = knockouts();
  const comp = all.find((k) => k.id === competition) ?? all[0];
  if (!comp) throw new Error("No cups in the config");
  const s = season ?? game.season;
  const clubs = new Map<number, Club>(session.cache.getAll("clubs").map((c) => [c.cid, c]));
  const fixtures = (await seasonRows(session, "fixtures", s))
    .filter((f) => f.competition === comp.id)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fid - b.fid));

  const rounds = comp.rounds.map((name) => {
    const matches = fixtures.filter((f) => f.round === name);
    const ties = new Map<string, Fixture[]>();
    for (const f of matches) {
      const pair = [f.homeCid, f.awayCid].sort((a, b) => a - b).join("-");
      ties.set(pair, [...(ties.get(pair) ?? []), f]);
    }
    return {
      name,
      date: matches[0]?.date ?? null,
      ties: [...ties.values()].map((legs): CupTie => {
        const first = legs[0] as Fixture;
        const decider = legs.find((f) => f.leg !== 1) ?? first;
        const winner = decider.result?.winnerCid ?? null;
        let aggregate: string | null = null;
        if (legs.length > 1 && legs.every((f) => f.result)) {
          const goals = (cid: number) =>
            legs.reduce(
              (s, f) =>
                s + (f.homeCid === cid ? (f.result?.homeGoals ?? 0) : (f.result?.awayGoals ?? 0)),
              0,
            );
          aggregate = `${goals(first.homeCid)}–${goals(first.awayCid)}`;
        }
        return {
          home: teamRef(clubs.get(first.homeCid)),
          away: teamRef(clubs.get(first.awayCid)),
          legs: legs.map((f) => matchView(f, clubs)),
          aggregate,
          winner: winner !== null ? teamRef(clubs.get(winner)) : null,
        };
      }),
    };
  });
  const final = rounds.at(-1)?.ties[0];
  return {
    id: comp.id,
    name: comp.name,
    season: s,
    competitions: all.map((k) => ({ id: k.id, name: k.name })),
    rounds,
    winner: final?.winner ?? null,
  };
}

/** The Monday of the week holding `date`. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

export async function getSchedule(lid: number, week: string | null): Promise<ScheduleView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const clubs = new Map<number, Club>(session.cache.getAll("clubs").map((c) => [c.cid, c]));
  const fixtures = seasonFixtures(session, game.season);
  const counts = new Map<string, number>();
  for (const f of fixtures) counts.set(weekStart(f.date), (counts.get(weekStart(f.date)) ?? 0) + 1);
  const weeks = [...counts.keys()].sort().map((start) => ({
    start,
    end: addDays(start, 6),
    matches: counts.get(start) ?? 0,
  }));
  // Default: this week if it has matches, else the next week that does (or the last).
  const today = weekStart(game.date);
  const chosen =
    (week && counts.has(week) ? week : null) ??
    weeks.find((w) => w.start >= today)?.start ??
    weeks.at(-1)?.start ??
    today;
  return {
    season: game.season,
    weeks,
    week: chosen,
    matches: fixtures.filter((f) => weekStart(f.date) === chosen).map((f) => matchView(f, clubs)),
  };
}
