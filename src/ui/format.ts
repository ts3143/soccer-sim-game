/** Display formatting (British English, euros). */

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

// Game dates are calendar dates stored as UTC midnight: format them in UTC, or they
// shift a day in time zones west of Greenwich.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** 30 Jun 2027 (from an ISO date or date-time). */
export const formatDate = (iso: string): string => dateFormat.format(new Date(iso));
