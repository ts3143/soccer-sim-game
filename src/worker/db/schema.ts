import type { DBSchema } from "idb";

/**
 * One IndexedDB database per league save (SPEC §12). M0 only creates `meta`;
 * the full store list arrives in M1. Bump LEAGUE_DB_VERSION and add an upgrade
 * step in openLeagueDb() whenever stores or indexes change.
 */
export const LEAGUE_DB_VERSION = 1;

export interface LeagueDBSchema extends DBSchema {
  /** Key-value rows: season, phase, date, user club, settings, RNG state, … */
  meta: { key: string; value: unknown };
}

export const leagueDbName = (lid: number): string => `league-${lid}`;

/** A small global database that lists the league saves (for Manage Leagues). */
export const GLOBAL_DB_NAME = "soccer-sim-game";
export const GLOBAL_DB_VERSION = 1;

export interface LeagueSummary {
  lid: number;
  name: string;
  /** ISO date-time. */
  createdAt: string;
  /** ISO date-time. */
  lastPlayedAt: string;
}

export interface GlobalDBSchema extends DBSchema {
  leagues: { key: number; value: LeagueSummary };
}
