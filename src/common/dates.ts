/** ISO date (YYYY-MM-DD) helpers. All dates are calendar dates in UTC; no time zones. */

const toDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, d));
};
const toIso = (date: Date): string => date.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Same day `years` later (29 Feb becomes 28 Feb in non-leap years). */
export function addYears(iso: string, years: number): string {
  const date = toDate(iso);
  const target = new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return toIso(target);
}

/** Whole years of age on `onDate`. */
export function ageOn(birthDate: string, onDate: string): number {
  const b = toDate(birthDate);
  const d = toDate(onDate);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (
    d.getUTCMonth() < b.getUTCMonth() ||
    (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())
  ) {
    age--;
  }
  return age;
}

/** Age in fractional years (for development curves). */
export function exactAge(birthDate: string, onDate: string): number {
  return (toDate(onDate).getTime() - toDate(birthDate).getTime()) / (365.2425 * 86_400_000);
}

/** Whole days from `from` to `to` (ISO dates). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "31 Jan 2028" from an ISO date. For text the game writes into the save (messages,
 * errors), so it doesn't depend on the browser's language; the UI shows dates the same way.
 */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[(m as number) - 1] ?? "?"} ${y}`;
}
