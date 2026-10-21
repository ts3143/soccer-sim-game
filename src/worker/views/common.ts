/**
 * Shared pieces of the page views (M5): clubs, competitions, fixtures and league tables as
 * the pages show them. Used by the game pages and the developer Season lab.
 */
import type { FormResult, MatchView, TableRowView, TableZone, TeamRef } from "../../common/api";
import { competitionsConfig } from "../../common/config/competitions";
import type { Club, Fixture, GameMeta, SeasonMeta, TransactionRow } from "../../common/schema";
import type { StoreValue } from "idb";
import type { LeagueDBSchema } from "../db/schema";
import type { LeagueSession } from "../league/session";
import { leagueTable } from "../schedule/standings";
import { playoffId } from "../season/season";

export const teamRef = (club: Club | undefined): TeamRef => ({
  cid: club?.cid ?? -1,
  name: club?.name ?? "?",
  abbr: club?.abbr ?? "?",
  code: club?.code ?? "",
});

export function competitionName(id: string): string {
  const league = competitionsConfig.leagues.find((l) => l.id === id);
  if (league) return league.name;
  const cup = competitionsConfig.cups.find((c) => c.id === id);
  if (cup) return cup.name;
  const po = competitionsConfig.leagues.find((l) => playoffId(l.id) === id);
  return po ? `${po.name} play-offs` : id;
}

/** "2–1", "1–1 aet, 4–3 pens"; null if not played yet. */
export function scoreText(f: Fixture): string | null {
  const r = f.result;
  if (!r) return null;
  const base = `${r.homeGoals}–${r.awayGoals}`;
  if (r.penalties) return `${base} aet, ${r.penalties.replace("-", "–")} pens`;
  return r.extraTime ? `${base} aet` : base;
}

export function matchView(f: Fixture, clubs: ReadonlyMap<number, Club>): MatchView {
  return {
    fid: f.fid,
    date: f.date,
    competition: f.competition,
    competitionName: competitionName(f.competition),
    round: f.round,
    leg: f.leg,
    neutral: f.neutral,
    home: teamRef(clubs.get(f.homeCid)),
    away: teamRef(clubs.get(f.awayCid)),
    score: scoreText(f),
    homeResult: resultFor(f, f.homeCid),
    winnerCid: f.result?.winnerCid ?? null,
  };
}

/** A club's result in a played fixture (a shoot-out decides it in a knockout tie). */
export function resultFor(f: Fixture, cid: number): FormResult | null {
  const r = f.result;
  if (!r) return null;
  if (r.winnerCid !== null && r.winnerCid !== undefined) return r.winnerCid === cid ? "W" : "L";
  const own = f.homeCid === cid ? r.homeGoals : r.awayGoals;
  const other = f.homeCid === cid ? r.awayGoals : r.homeGoals;
  return own > other ? "W" : own < other ? "L" : "D";
}

/** The season's fixtures in date order (the cache holds the current season's). */
export function seasonFixtures(session: LeagueSession, season: number): Fixture[] {
  return session.cache
    .getAll("fixtures")
    .filter((f) => f.season === season)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fid - b.fid));
}

/** The last `n` results of a club, oldest first. */
export const formOf = (fixtures: readonly Fixture[], cid: number, n = 5): FormResult[] =>
  fixtures
    .filter((f) => f.result && (f.homeCid === cid || f.awayCid === cid))
    .slice(-n)
    .map((f) => resultFor(f, cid) as FormResult);

/** Every league's table this season, with promotion, play-off and relegation zones. */
export function leagueTables(
  session: LeagueSession,
  fixtures: readonly Fixture[],
): { id: string; name: string; rows: TableRowView[] }[] {
  const game = session.cache.get("meta", "game") as GameMeta;
  const stored = session.cache.get("meta", "season") as SeasonMeta;
  const clubs = new Map(session.cache.getAll("clubs").map((c) => [c.cid, c]));
  return competitionsConfig.leagues.map((league) => {
    const cids = stored.leagueClubs[league.id] ?? [];
    const rows = leagueTable(
      cids,
      fixtures.filter((f) => f.competition === league.id),
      {
        tieBreakers: league.tieBreakers,
        drawSeed: `${game.seed}/table/${league.id}/${game.season}`,
      },
    );
    const po = league.promotion?.playoffPositions ?? [];
    const zone = (pos: number): TableZone =>
      pos === 1
        ? "champions"
        : league.promotion && pos <= league.promotion.automatic
          ? "promoted"
          : po.includes(pos)
            ? "playoffs"
            : league.relegation && pos > rows.length - league.relegation.places
              ? "relegated"
              : null;
    return {
      id: league.id,
      name: league.name,
      rows: rows.map((r) => ({ ...r, ...teamRef(clubs.get(r.cid)), zone: zone(r.position) })),
    };
  });
}

type SeasonStore = "fixtures" | "awards" | "playerStats" | "transactions" | "matches";

/**
 * A season's rows of a season-scoped store: the cache holds the current season's, IndexedDB
 * the past ones (SPEC §12: uncommon reads go to IndexedDB).
 */
export async function seasonRows<S extends SeasonStore>(
  session: LeagueSession,
  store: S,
  season: number,
): Promise<StoreValue<LeagueDBSchema, S>[]> {
  const game = session.cache.get("meta", "game") as GameMeta;
  if (season === game.season) {
    return session.cache.getAll(store).filter((r) => r.season === season);
  }
  // Every season-scoped store has a "season" index (src/worker/db/leagueDb.ts).
  const db = session.db as unknown as {
    getAllFromIndex(store: string, index: string, key: number): Promise<unknown[]>;
  };
  return (await db.getAllFromIndex(store, "season", season)) as StoreValue<LeagueDBSchema, S>[];
}

/** A transaction as one line, from its name snapshots (they read after players are pruned). */
export function describeTransaction(t: Pick<TransactionRow, "type" | "names">): string {
  const [player = "?", a = "", b = ""] = t.names;
  switch (t.type) {
    case "transfer":
      return `${player} moves from ${a} to ${b}`;
    case "freeAgent":
      return `${player} signs for ${t.names.at(-1) ?? ""} on a free`;
    case "loan":
      return `${player} joins ${b} on loan from ${a}`;
    case "renewal":
      return `${player} renews at ${a}`;
    case "release":
      return / \(contract ended\)$/.test(a)
        ? `${player} leaves ${a.replace(/ \(contract ended\)$/, "")} at the end of his contract`
        : `${player} released by ${a}`;
    case "academyPromotion":
      return `${player} promoted from ${a}'s academy`;
    case "retirement":
      return `${player} retires`;
    default:
      return t.names.join(", ");
  }
}
