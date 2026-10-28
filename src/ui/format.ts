/** Display formatting (British English, euros). */
import { formatDay } from "../common/dates";

const euroCompact = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** €1.2M, €450K. */
export const formatEuros = (value: number): string => euroCompact.format(value);

export const formatPercent = (share: number, digits = 1): string =>
  `${(share * 100).toFixed(digits)}%`;

/** 30 Jun 2027 (from an ISO date or date-time), the same format as the game's own messages. */
export const formatDate = (iso: string): string => formatDay(iso);

/** 30 Jun, where the year is plain from what's next to it. */
export const formatDayMonth = (iso: string): string => formatDay(iso).replace(/ \d+$/, "");

/** 1st, 2nd, 3rd, 11th, 22nd. */
export const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** A draft by the year it's held: season 2026/27's is the "2027 draft" (June 2027). */
export const draftName = (season: number): string => `${season + 1} draft`;
