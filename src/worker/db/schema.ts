import type { DBSchema } from "idb";
import type {
  AwardRow,
  Club,
  ClubSeason,
  CompetitionRow,
  Fixture,
  InboxMessage,
  LeagueSummary,
  MatchRecord,
  Offer,
  Player,
  PlayerStatsRow,
  TransactionRow,
} from "../../common/schema";

/**
 * One IndexedDB database per league save (SPEC §12). Bump LEAGUE_DB_VERSION and add a
 * step in openLeagueDb()'s upgrade whenever stores or indexes change.
 *   v1 (M0): meta only.   v2 (M1): every store of SPEC §12.
 *   v3 (0.2.0): no store changes; match ratings rescaled to the 6.9 scale (upgrades.ts).
 *   v4: no store changes; man of the match named in match records, counted on stat rows.
 *   v5: no store changes; academy players of a club's own country born in its city (half).
 */
export const LEAGUE_DB_VERSION = 5;

export interface LeagueDBSchema extends DBSchema {
  /** Key-value rows; see MetaRows in src/common/schema.ts. */
  meta: { key: string; value: unknown };
  competitions: { key: string; value: CompetitionRow };
  clubs: { key: number; value: Club };
  clubSeasons: { key: [number, number]; value: ClubSeason; indexes: { season: number } };
  players: { key: number; value: Player; indexes: { cid: number; status: string } };
  playerStats: {
    key: [number, number, number, string];
    value: PlayerStatsRow;
    indexes: { season: number; pid: number };
  };
  fixtures: { key: number; value: Fixture; indexes: { season: number; date: string } };
  matches: { key: number; value: MatchRecord; indexes: { season: number } };
  offers: { key: number; value: Offer; indexes: { pid: number } };
  transactions: { key: number; value: TransactionRow; indexes: { season: number; pids: number } };
  inbox: { key: number; value: InboxMessage };
  awards: { key: number; value: AwardRow; indexes: { season: number } };
}

export type { LeagueSummary };

export type LeagueStore = Exclude<keyof LeagueDBSchema, symbol>;

export const leagueDbName = (lid: number): string => `league-${lid}`;

/** A small global database that lists the league saves (for Manage Leagues). */
export const GLOBAL_DB_NAME = "soccer-sim-game";
/** v1 (M0): leagues store.  v2 (M1): drops the M0 plumbing-demo save. */
export const GLOBAL_DB_VERSION = 2;

export interface GlobalDBSchema extends DBSchema {
  leagues: { key: number; value: LeagueSummary };
}
