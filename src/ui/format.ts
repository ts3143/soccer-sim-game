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
