/**
 * Worlds (SPEC §17.1). A world is data: its clubs file, its competitions config and a set
 * of switches. New game offers one choice per world; the switches aren't shown. Worker
 * code branches on the switches, never on a world's id, so a later world is a new
 * combination of switches plus data. A save records its world's id and reads the world
 * from the bundled files, so config tuning reaches existing saves.
 *
 * Only Classic so far; the Super League world arrives with its data (MILESTONES SL1).
 */
import { type ClubDefinition, clubDefinitions } from "./clubs";
import { type CompetitionsConfig, competitionsConfig } from "./competitions";

export type WorldId = "classic";

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

export interface WorldDefinition {
  id: WorldId;
  /** As offered at New game. */
  name: string;
  clubs: readonly ClubDefinition[];
  competitions: CompetitionsConfig;
  switches: WorldSwitches;
}

export const worlds: Readonly<Record<WorldId, WorldDefinition>> = {
  classic: {
    id: "classic",
    name: "Classic",
    clubs: clubDefinitions,
    competitions: competitionsConfig,
    switches: {
      market: "transfers",
      youth: "academy",
      moneyRule: "ffp",
      loans: true,
      renewals: "windows",
    },
  },
};

const isWorldId = (id: string): id is WorldId => Object.hasOwn(worlds, id);

export function worldById(id: string): WorldDefinition {
  if (!isWorldId(id)) throw new Error(`Unknown world ${id}`);
  return worlds[id];
}
