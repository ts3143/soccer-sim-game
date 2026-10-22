/**
 * Market value, player mood and contract demands (SPEC §4.6, §7.3, §7.6).
 *
 * Market value (€, derived, never stored) from OVR, POT, age, contract years left, form
 * and the level of the league he plays in:
 *   value = €40M × exp(0.16 × (rated OVR − 75)) × age × contract × form × league
 * where "rated OVR" credits young players with part of their headroom to POT.
 *
 * Mood (−1 to 1, ZenGM-style) from team success, hype, facilities, market size, playing
 * time and loyalty, weighted by his mood traits, less a small ambition penalty when he has
 * clearly outgrown the club (T, 2026-10-18: kept subtle so talent doesn't drain to the big
 * clubs). It affects only contract talks: below −0.6 he won't negotiate; otherwise happier
 * players ask less.
 *
 * Wage demand per contract length: the market wage for his OVR and age at a club of this
 * size (fitted on the opening contracts), adjusted for the length (he asks more for a
 * length he doesn't want), his mood, and his final year (final-year players are harder to
 * re-sign, SPEC §3.1).
 */
import { daysBetween, exactAge } from "../../common/dates";
import type { Club, ClubSeason, MoodTrait, Player } from "../../common/schema";
import { COEFFICIENTS } from "../engine/coefficients";
import { ratingCentre } from "../engine/ratings";
import { roundWage } from "../generate/contracts";

export const MARKET = {
  value: {
    at75: 40_000_000,
    perOvr: 0.16,
    /** Share of POT − OVR credited, full up to 21, none from 27. */
    potentialShare: 0.6,
    /** From this age, × declinePerYear per year older. */
    declineFrom: 29,
    declinePerYear: 0.85,
    /** By contract years left (index 0 = expired / free agent). */
    contract: [0.25, 0.6, 0.85, 1, 1, 1],
    /** Form: × (1 + perPoint × average rating vs his position's centre, within ±range). */
    formPerRatingPoint: 0.12,
    formRange: 1.25,
    /** League factor = exp(perLevel × (league level − 70)), level = average best-XI OVR. */
    leaguePerLevel: 0.06,
    min: 25_000,
  },
  /** Fitted on the opening contracts (log wage on OVR, club revenue and age). */
  wage: {
    /** 5.62M fitted on the opening contracts, +15% (M4 tuning: clubs spend their revenue). */
    at65: 6_463_000,
    perOvr: 0.108,
    revenueRef: 200_000_000,
    revenuePower: 0.289,
    age: [
      [20, 0.44],
      [23, 0.64],
      [30, 1],
      [99, 0.92],
    ] as [number, number][],
  },
  mood: {
    weights: { success: 1, hype: 0.6, facilities: 0.5, market: 0.5, playingTime: 1, loyalty: 0.5 },
    /** Trait → components it doubles. */
    traits: {
      fame: ["market", "hype", "playingTime"],
      loyalty: ["loyalty"],
      winning: ["success"],
      money: [],
    } as Record<MoodTrait, string[]>,
    /**
     * Ambition: once his level (OVR, plus part of a young player's headroom to POT) is more
     * than `from` above the club's best-XI level, mood falls by up to `penalty`, reached at
     * `from + span`. The gap counts only as far as stronger clubs exist, so no one outgrows
     * the strongest. Fame or Winning doubles it. Subtle by design: a star at a small club
     * asks a few per cent more and is a little readier to leave, no more. (A club's best
     * player is typically 3–7 above its XI level, hence `from`.)
     */
    ambition: { penalty: 0.1, from: 6, span: 10, potentialShare: 0.5, traits: ["fame", "winning"] },
    refuseBelow: -0.6,
    /** Ask × (1 − perMood × mood); "money" players ask this much more. */
    perMood: 0.15,
    moneyTrait: 0.1,
  },
  ask: {
    /** Extra asked per year away from the length he wants. */
    perYearOff: 0.05,
    finalYear: 0.1,
    /**
     * Free agents (SPEC §7.5, ZenGM-style): asks start high and fall the longer he stays
     * unsigned, from `start` toward `floor` (× the going wage), losing 63% of the gap every
     * `days` days.
     */
    freeAgent: { start: 1.25, floor: 0.6, days: 60 },
  },
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Contract years left on `date` (a contract ending this 30 June counts as 1). */
export function yearsLeft(p: Player, date: string): number {
  if (!p.contract) return 0;
  const endYear = Number(p.contract.expires.slice(0, 4));
  const seasonEndYear =
    Number(date.slice(5, 7)) >= 7 ? Number(date.slice(0, 4)) + 1 : Number(date.slice(0, 4));
  return Math.max(0, endYear - seasonEndYear + 1);
}

/** Market value in euros. `leagueLevel` = average best-XI OVR of his league (~70 in ENG1). */
export function marketValue(p: Player, date: string, leagueLevel = 66, avgRating?: number): number {
  const v = MARKET.value;
  const age = exactAge(p.birthDate, date);
  const youth = clamp((27 - age) / 6, 0, 1);
  const rated = p.ovr + v.potentialShare * youth * Math.max(0, p.pot - p.ovr);
  let value = v.at75 * Math.exp(v.perOvr * (rated - 75));
  if (age > v.declineFrom) value *= v.declinePerYear ** (age - v.declineFrom);
  value *= v.contract[Math.min(v.contract.length - 1, yearsLeft(p, date))] ?? 1;
  if (avgRating !== undefined) {
    const centre = ratingCentre(p.position, COEFFICIENTS);
    const form = clamp(avgRating - centre, -v.formRange, v.formRange);
    value *= 1 + v.formPerRatingPoint * form;
  }
  value *= Math.exp(v.leaguePerLevel * (leagueLevel - 70));
  return Math.max(v.min, Math.round(value / 10_000) * 10_000);
}

/** The going wage for a player of this OVR and age at a club with this revenue. */
export function marketWage(ovr: number, age: number, clubRevenue: number): number {
  const w = MARKET.wage;
  const ageFactor = w.age.find(([upTo]) => age <= upTo)?.[1] ?? 1;
  return (
    w.at65 *
    Math.exp(w.perOvr * (ovr - 65)) *
    Math.pow(Math.max(1, clubRevenue) / w.revenueRef, w.revenuePower) *
    ageFactor
  );
}

export interface MoodContext {
  club: Club;
  season: ClubSeason;
  /** Board results score 0–100 (50 = on target). */
  success: number;
  /** His share of the club's minutes this season. */
  minutesShare: number;
  /** Seasons at the club. */
  yearsAtClub: number;
  /**
   * For ambition (omitted: no ambition penalty): the club's best-XI OVR, the strongest
   * club's, and the date.
   */
  levels?: { club: number; top: number; date: string };
}

export interface Mood {
  value: number;
  components: Record<string, number>;
  willing: boolean;
}

/** His mood toward a club (−1 to 1) and whether he'll negotiate. */
export function playerMood(p: Player, ctx: MoodContext): Mood {
  const m = MARKET.mood;
  const components: Record<string, number> = {
    success: clamp((ctx.success - 50) / 50, -1, 1),
    hype: clamp((ctx.season.hype - 50) / 50, -1, 1),
    facilities: clamp(((ctx.club.facilitiesLevel ?? 50) - 50) / 50, -1, 1),
    market: clamp((ctx.club.market - 50) / 50, -1, 1),
    playingTime: clamp((ctx.minutesShare - 0.4) / 0.4, -1, 1),
    loyalty: clamp(ctx.yearsAtClub / 5, 0, 1),
  };
  let total = 0;
  let weights = 0;
  for (const [key, value] of Object.entries(components)) {
    let w = m.weights[key as keyof typeof m.weights] ?? 0;
    for (const trait of p.moodTraits) if (m.traits[trait].includes(key)) w *= 2;
    total += w * value;
    weights += w;
  }
  let value = weights > 0 ? total / weights : 0;
  if (ctx.levels) {
    const a = m.ambition;
    const { club, top, date } = ctx.levels;
    const gap = Math.min(playerLevel(p, date) - club, top - club);
    components.ambition = -clamp((gap - a.from) / a.span, 0, 1);
    const doubled = p.moodTraits.some((t) => a.traits.includes(t));
    value = clamp(value + components.ambition * a.penalty * (doubled ? 2 : 1), -1, 1);
  }
  return { value, components, willing: value >= m.refuseBelow };
}

/** His level for ambition: OVR, crediting a young player with part of his headroom. */
export function playerLevel(p: Player, date: string): number {
  const youth = clamp((27 - exactAge(p.birthDate, date)) / 6, 0, 1);
  return p.ovr + MARKET.mood.ambition.potentialShare * youth * Math.max(0, p.pot - p.ovr);
}

/** The contract length a player wants, by age. */
export const preferredYears = (age: number): number =>
  age <= 24 ? 4 : age <= 29 ? 3 : age <= 32 ? 2 : 1;

export interface ContractAsk {
  years: number;
  wage: number;
}

/** A free agent's ask as a share of the going wage, by how long he has been unsigned. */
export function freeAgentAskFactor(p: Player, date: string): number {
  if (p.status !== "freeAgent" || !p.freeAgentSince) return 1;
  const f = MARKET.ask.freeAgent;
  const days = Math.max(0, daysBetween(p.freeAgentSince, date));
  return f.floor + (f.start - f.floor) * Math.exp(-days / f.days);
}

/** Wage asked for each length 1–5 (the club's revenue sets the going rate). */
export function contractAsks(
  p: Player,
  date: string,
  clubRevenue: number,
  mood: number,
  finalYear: boolean,
): ContractAsk[] {
  const age = exactAge(p.birthDate, date);
  const base = marketWage(p.ovr, age, clubRevenue);
  const want = preferredYears(age);
  const moodFactor =
    (1 - MARKET.mood.perMood * mood) *
    (p.moodTraits.includes("money") ? 1 + MARKET.mood.moneyTrait : 1);
  const final = (finalYear ? 1 + MARKET.ask.finalYear : 1) * freeAgentAskFactor(p, date);
  return [1, 2, 3, 4, 5].map((years) => ({
    years,
    wage: roundWage(
      base * moodFactor * final * (1 + MARKET.ask.perYearOff * Math.abs(years - want)),
    ),
  }));
}

/**
 * Contract end for a deal of `years` signed on `date` during `season` (2026 = 2026/27). A
 * summer deal counts this season as its first year; a January deal's years start next
 * season, the half season left coming on top (football's "two and a half years").
 */
export const contractEnd = (season: number, years: number, date: string): string =>
  `${season + years + (Number(date.slice(5, 7)) >= 7 ? 0 : 1)}-06-30`;

/**
 * Applies a new contract (renewal or signing): wage, end date, and the unamortised fee
 * re-spread over the new length (SPEC §6.3).
 */
export function signContract(p: Player, wage: number, expires: string, date: string): void {
  p.contract = { wage, expires };
  if (p.feeBalance && p.feeBalance.remaining <= 0) p.feeBalance = null;
  if (p.feeBalance && p.feeBalance.remaining > 0) {
    const years = Math.max(1, yearsLeft(p, date));
    p.feeBalance = {
      remaining: p.feeBalance.remaining,
      perYear: Math.round(p.feeBalance.remaining / years),
    };
  }
}
