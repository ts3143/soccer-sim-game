/**
 * Every league page of the game UI (SPEC §11), by sidebar section. `chunk` is the M5 chunk
 * that builds it (a placeholder until then); `m6` pages arrive with the Management UI.
 * `team` pages carry a club id in the URL and show the team dropdown; `season` pages a
 * season dropdown.
 */
export const SECTIONS = ["General", "League", "Team", "Players", "Stats"] as const;
export type Section = (typeof SECTIONS)[number];

export interface PageDef {
  key: string;
  title: string;
  section: Section;
  chunk?: number;
  m6?: boolean;
  team?: boolean;
  season?: boolean;
  /** Reached by links only (player profile, box score), not listed in the sidebar. */
  hidden?: boolean;
}

export const PAGES: PageDef[] = [
  { key: "dashboard", title: "Dashboard", section: "General", chunk: 2 },
  { key: "inbox", title: "Inbox", section: "General", chunk: 2 },
  { key: "standings", title: "Standings", section: "League", chunk: 3, season: true },
  { key: "cups", title: "Cups", section: "League", chunk: 3, season: true },
  { key: "schedule", title: "Schedule", section: "League", chunk: 3 },
  { key: "power-rankings", title: "Power Rankings", section: "League", chunk: 7 },
  { key: "finances", title: "Finances", section: "League", chunk: 7, season: true },
  { key: "history", title: "History", section: "League", chunk: 7 },
  { key: "transactions", title: "Transactions", section: "League", chunk: 7, season: true },
  { key: "squad", title: "Squad", section: "Team", chunk: 4, team: true },
  { key: "game-log", title: "Game Log", section: "Team", chunk: 5, team: true, season: true },
  { key: "team-history", title: "Team History", section: "Team", chunk: 7, team: true },
  { key: "free-agents", title: "Free Agents", section: "Players", m6: true },
  { key: "transfer-market", title: "Transfer Market", section: "Players", m6: true },
  { key: "player", title: "Player", section: "Players", chunk: 4, hidden: true },
  { key: "box-score", title: "Box Score", section: "Team", chunk: 5, hidden: true },
  { key: "league-leaders", title: "League Leaders", section: "Stats", chunk: 6, season: true },
  { key: "player-ratings", title: "Player Ratings", section: "Stats", chunk: 6 },
  { key: "player-stats", title: "Player Stats", section: "Stats", chunk: 6, season: true },
  { key: "team-stats", title: "Team Stats", section: "Stats", chunk: 6, season: true },
  { key: "injuries", title: "Injuries", section: "Stats", chunk: 6 },
];

export const pageOf = (key: string): PageDef | undefined => PAGES.find((p) => p.key === key);
