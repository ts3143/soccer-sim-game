/**
 * Worlds (SPEC §17.1). A world is data: its clubs file, its competitions config and a set
 * of switches. New game offers one choice per world; the switches aren't shown. Worker
 * code branches on the switches, never on a world's id, so a later world is a new
 * combination of switches plus data. A save records its world's id and reads the world
 * from the bundled files, so config tuning reaches existing saves.
 *
 * Classic, and the Super League (SPEC §17; built over MILESTONES SL1–SL8).
 */
import classicClubs from "../../../data/clubs_2026_27.json";
import superLeagueClubs from "../../../data/clubs_super_league_2026_27.json";
import classicCompetitions from "../../../data/config/competitions_mvp.json";
import superLeagueCompetitions from "../../../data/config/competitions_super_league.json";
import { type ClubDefinition, parseClubs } from "./clubs";
import { type CompetitionsConfig, parseCompetitions } from "./competitions";

export type WorldId = "classic" | "superLeague";

/** How a world works. Cups aren't a switch: they're in the competitions config. */
export interface WorldSwitches {
  /** How players change clubs: the transfer market (§7.3) or trades (§17.6). */
  market: "transfers" | "trades";
  /** Where new players come from: club academies (§7.2) or the draft (§17.5). */
  youth: "academy" | "draft";
  /** The money rule: FFP (§6.4) or a tiered soft cap (§17.7). */
  moneyRule: "ffp" | "softCap";
  /** Loans between clubs (§7.4). */
  loans: boolean;
  /** When contracts are renewed: in the windows (§3.1) or one re-signing period (§17.6). */
  renewals: "windows" | "resigningPeriod";
}

export interface WorldConfig {
  id: WorldId;
  /** As offered at New game. */
  name: string;
  clubs: readonly ClubDefinition[];
  competitions: CompetitionsConfig;
  switches: WorldSwitches;
}

export const worlds: Readonly<Record<WorldId, WorldConfig>> = {
  classic: {
    id: "classic",
    name: "Classic",
    clubs: parseClubs(classicClubs),
    competitions: parseCompetitions(classicCompetitions, "competitions_mvp.json"),
    switches: {
      market: "transfers",
      youth: "academy",
      moneyRule: "ffp",
      loans: true,
      renewals: "windows",
    },
  },
  superLeague: {
    id: "superLeague",
    name: "Super League",
    clubs: parseClubs(superLeagueClubs),
    competitions: parseCompetitions(superLeagueCompetitions, "competitions_super_league.json"),
    switches: {
      market: "trades",
      youth: "draft",
      moneyRule: "softCap",
      loans: false,
      renewals: "resigningPeriod",
    },
  },
};

const isWorldId = (id: string): id is WorldId => Object.hasOwn(worlds, id);

export function worldById(id: string): WorldConfig {
  if (!isWorldId(id)) throw new Error(`Unknown world ${id}`);
  return worlds[id];
}
