/**
 * Club definitions (data/clubs_2026_27.json), whitelisted field by field.
 *
 * The data file's `based_on` field (the real club each one mirrors) is a dev reference
 * only (SPEC §6.1): it is never copied here, so it can't reach a save or the UI. The
 * build also strips it from the bundled JSON (tools/vite/strip-based-on.ts), and
 * tools/check-bundle.ts fails the build if a real club name turns up in the output.
 */
import raw from "../../../data/clubs_2026_27.json";

export interface ClubDefinition {
  /** Short lowercase code, e.g. "isl"; also names the crest file data/crests/<code>.svg. */
  code: string;
  league: string;
  name: string;
  short: string;
  abbr: string;
  city: string;
  country: string;
  capacity: number;
  colors: { primary: string; secondary: string; tertiary: string };
  /** 1–100. */
  market: number;
  /** 1–100. */
  reputation: number;
  /** Season-1 revenue anchor in whole euros (from revenue_m). */
  revenue: number;
  /** Target mean slot OVR of the best XI in the club's default formation. */
  strength: number;
  crest: { shape: string; motif: string; initials: string };
}

export const clubDefinitions: readonly ClubDefinition[] = raw.clubs.map((c) => ({
  code: c.id,
  league: c.league,
  name: c.name,
  short: c.short,
  abbr: c.abbr,
  city: c.city,
  country: c.country,
  capacity: c.capacity,
  colors: { primary: c.colors.primary, secondary: c.colors.secondary, tertiary: c.colors.tertiary },
  market: c.market,
  reputation: c.reputation,
  revenue: Math.round(c.revenue_m * 1_000_000),
  strength: c.strength,
  crest: { shape: c.crest.shape, motif: c.crest.motif, initials: c.crest.initials },
}));
