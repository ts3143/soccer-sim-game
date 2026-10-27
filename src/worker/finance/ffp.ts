/**
 * Financial fair play (SPEC §6.4), checked on 30 June for every club, AI included:
 *   squad cost ratio = (wages + transfer-fee amortisation) / (revenue + profit on sales)
 * must be at most 70%. Revenue here is operating revenue (gates, TV, commercial, prizes);
 * profit on a sale is the fee less the player's unamortised balance.
 *
 * Penalties (MVP, SPEC default): a season over the ratio brings a warning; a second in a
 * row bans signings (transfers, free agents and loans in) for the next window, the
 * summer. A season within the ratio clears the warning. Negative cash separately freezes
 * transfer fees (src/worker/market/transfers.ts, clubBudgets).
 */
import type { CompetitionsConfig } from "../../common/config/competitions";
import type { Club, ClubSeason, InboxMessage } from "../../common/schema";
import { seasonDate } from "../schedule/calendar";
import { type FinanceWorld, operatingRevenue } from "./finance";
import { formatDay } from "../../common/dates";

export const FFP = { ratio: 0.7 };

export interface FfpResult {
  /** Players whose fee balance changed (to save). */
  changed: Set<number>;
  messages: Omit<InboxMessage, "mid">[];
  /** Clubs over the ratio this season, and those now banned. */
  breaches: number[];
  bans: number[];
}

/** A season's squad cost ratio from its books. */
export function squadCostOf(row: ClubSeason) {
  const wages = row.expenses.wages ?? 0;
  const amortisation = row.amortisation ?? 0;
  const revenue = operatingRevenue(row.revenue) + (row.salesProfit ?? 0);
  return { wages, amortisation, revenue, ratio: (wages + amortisation) / Math.max(1, revenue) };
}

/** True while a club may not sign anyone (an FFP ban until the window's deadline day). */
export const transferBanned = (club: Club, date: string): boolean =>
  club.ffp?.bannedUntil !== null &&
  club.ffp?.bannedUntil !== undefined &&
  date <= club.ffp.bannedUntil;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The 30 June check for every club; sets each row's squad cost ratio. */
export function ffpCheck(
  world: FinanceWorld,
  season: number,
  userCid: number,
  config: CompetitionsConfig,
): FfpResult {
  const out: FfpResult = { changed: new Set(), messages: [], breaches: [], bans: [] };
  const summer = config.windows.find((w) => w.id === "summer");
  const banUntil = seasonDate(season + 1, summer?.deadlineDay ?? "08-31");
  const date = `${season + 1}-06-30`;
  for (const club of world.clubs) {
    const row = world.clubSeasons.get(club.cid);
    if (!row) continue;
    const { ratio } = squadCostOf(row);
    row.squadCostRatio = Math.round(ratio * 1000) / 1000;
    const standing = club.ffp ?? { warned: false, bannedUntil: null };
    const over = ratio > FFP.ratio;
    let subject: string | null = null;
    let body = "";
    if (over && standing.warned) {
      club.ffp = { warned: true, bannedUntil: banUntil };
      out.bans.push(club.cid);
      subject = "FFP: transfer ban";
      body = `Squad cost was ${pct(ratio)} of revenue again (limit ${pct(FFP.ratio)}). You can't sign anyone until ${formatDay(banUntil)}.`;
    } else if (over) {
      club.ffp = { warned: true, bannedUntil: standing.bannedUntil };
      subject = "FFP warning";
      body = `Squad cost was ${pct(ratio)} of revenue (limit ${pct(FFP.ratio)}). Another season over the limit brings a one-window transfer ban.`;
    } else {
      club.ffp = { warned: false, bannedUntil: standing.bannedUntil };
    }
    if (over) out.breaches.push(club.cid);
    if (subject && club.cid === userCid) {
      out.messages.push({ date, season, kind: "ffp", subject, body, read: false });
    }
  }
  return out;
}
