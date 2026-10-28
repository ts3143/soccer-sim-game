/**
 * Every league page of the game UI (SPEC §11), by sidebar section.
 * `team` pages carry a club id in the URL and show the team dropdown; `season` pages a
 * season dropdown. `when` limits a page to worlds whose switches allow it (SPEC §17.8).
 */
import type { LeagueShell } from "../../common/api";
import type { WorldSwitches } from "../../common/config/worlds";

export const SECTIONS = ["General", "League", "Team", "Players", "Stats"] as const;
export type Section = (typeof SECTIONS)[number];

export interface PageDef {
  key: string;
  title: string;
  section: Section;
  team?: boolean;
  season?: boolean;
  /** Reached by links only (player profile, box score), not listed in the sidebar. */
  hidden?: boolean;
  /** Only in worlds whose switches pass (absent: every world). */
  when?: (switches: WorldSwitches) => boolean;
  /** Its title in a world, where it differs from `title`. */
  titleIn?: (world: LeagueShell["world"]) => string;
}

const transfers = (s: WorldSwitches) => s.market === "transfers";
const academies = (s: WorldSwitches) => s.youth === "academy";
const drafts = (s: WorldSwitches) => s.youth === "draft";
const trades = (s: WorldSwitches) => s.market === "trades";
const resigningPeriod = (s: WorldSwitches) => s.renewals === "resigningPeriod";

export const PAGES: PageDef[] = [
  { key: "dashboard", title: "Dashboard", section: "General" },
  { key: "standings", title: "Standings", section: "League", season: true },
  // A world without cups (the Super League) has only play-offs there.
  {
    key: "cups",
    title: "Cups",
    section: "League",
    season: true,
    titleIn: (w) => (w.cups ? "Cups" : "Play-offs"),
  },
  { key: "schedule", title: "Schedule", section: "League" },
  { key: "power-rankings", title: "Power Rankings", section: "League" },
  { key: "finances", title: "Finances", section: "League", season: true },
  { key: "history", title: "History", section: "League" },
  { key: "transactions", title: "Transactions", section: "League", season: true },
  { key: "squad", title: "Squad", section: "Team", team: true },
  { key: "tactics", title: "Tactics", section: "Team", team: true },
  { key: "academy", title: "Youth Academy", section: "Team", when: academies },
  { key: "club-finances", title: "Finances & Facilities", section: "Team" },
  { key: "draft-picks", title: "Draft Picks", section: "Team", team: true, when: drafts },
  { key: "game-log", title: "Game Log", section: "Team", team: true, season: true },
  { key: "team-history", title: "Team History", section: "Team", team: true },
  { key: "free-agents", title: "Free Agents", section: "Players" },
  { key: "transfer-market", title: "Transfer Market", section: "Players", when: transfers },
  { key: "trade", title: "Trade", section: "Players", when: trades },
  { key: "trading-block", title: "Trading Block", section: "Players", when: trades },
  { key: "draft", title: "Draft", section: "Players", when: drafts },
  { key: "resign-players", title: "Re-sign Players", section: "Players", when: resigningPeriod },
  { key: "player", title: "Player", section: "Players", hidden: true },
  { key: "box-score", title: "Box Score", section: "Team", hidden: true },
  { key: "live", title: "Live match", section: "Team", hidden: true },
  { key: "fired", title: "You're fired", section: "General", hidden: true },
  { key: "league-leaders", title: "League Leaders", section: "Stats", season: true },
  { key: "player-ratings", title: "Player Ratings", section: "Stats" },
  { key: "player-stats", title: "Player Stats", section: "Stats", season: true },
  { key: "team-stats", title: "Team Stats", section: "Stats", season: true },
  { key: "injuries", title: "Injuries", section: "Stats" },
];

export const pageOf = (key: string): PageDef | undefined => PAGES.find((p) => p.key === key);

/** The page's title in this world. */
export const pageTitle = (page: PageDef, world: LeagueShell["world"]): string =>
  page.titleIn?.(world) ?? page.title;

/** The page is part of this world (its switches allow it). */
export const inWorld = (page: PageDef, switches: WorldSwitches): boolean =>
  page.when?.(switches) ?? true;
