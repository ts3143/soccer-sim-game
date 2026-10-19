/**
 * Every league page of the game UI (SPEC §11), by sidebar section. `m6` pages arrive with
 * the Management UI (a placeholder until then).
 * `team` pages carry a club id in the URL and show the team dropdown; `season` pages a
 * season dropdown.
 */
export const SECTIONS = ["General", "League", "Team", "Players", "Stats"] as const;
export type Section = (typeof SECTIONS)[number];

export interface PageDef {
  key: string;
  title: string;
  section: Section;
  m6?: boolean;
  team?: boolean;
  season?: boolean;
  /** Reached by links only (player profile, box score), not listed in the sidebar. */
  hidden?: boolean;
}

export const PAGES: PageDef[] = [
  { key: "dashboard", title: "Dashboard", section: "General" },
  { key: "inbox", title: "Inbox", section: "General" },
  { key: "standings", title: "Standings", section: "League", season: true },
  { key: "cups", title: "Cups", section: "League", season: true },
  { key: "schedule", title: "Schedule", section: "League" },
  { key: "power-rankings", title: "Power Rankings", section: "League" },
  { key: "finances", title: "Finances", section: "League", season: true },
  { key: "history", title: "History", section: "League" },
  { key: "transactions", title: "Transactions", section: "League", season: true },
  { key: "squad", title: "Squad", section: "Team", team: true },
  { key: "game-log", title: "Game Log", section: "Team", team: true, season: true },
  { key: "team-history", title: "Team History", section: "Team", team: true },
  { key: "free-agents", title: "Free Agents", section: "Players", m6: true },
  { key: "transfer-market", title: "Transfer Market", section: "Players", m6: true },
  { key: "player", title: "Player", section: "Players", hidden: true },
  { key: "box-score", title: "Box Score", section: "Team", hidden: true },
  { key: "league-leaders", title: "League Leaders", section: "Stats", season: true },
  { key: "player-ratings", title: "Player Ratings", section: "Stats" },
  { key: "player-stats", title: "Player Stats", section: "Stats", season: true },
  { key: "team-stats", title: "Team Stats", section: "Stats", season: true },
  { key: "injuries", title: "Injuries", section: "Stats" },
];

export const pageOf = (key: string): PageDef | undefined => PAGES.find((p) => p.key === key);
