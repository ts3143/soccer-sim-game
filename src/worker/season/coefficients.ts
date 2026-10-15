/**
 * Season-loop coefficients (condition, recovery, squad selection), tuned with the
 * calibration harness like the engine's. Spec-level rules stay in data/config.
 */
export const SQUAD_COEFFICIENTS = {
  /**
   * Recovery between matches (SPEC §8.4): the gap to 100% shrinks by a factor
   * exp(−rate × days). Faster with endurance and the Medical dial, slower with age.
   */
  recovery: {
    perDay: 0.3,
    enduranceBase: 0.8,
    enduranceSpan: 0.4,
    medicalBase: 0.9,
    medicalSpan: 0.2,
    slowerFromAge: 29,
    perYearOlder: 0.03,
    ageFloor: 0.75,
  },
  /**
   * Training injuries (SPEC §8.4, T 2026-10-15): risk per player per day at full condition,
   * scaled like in-match risk (tiredness, Injury Prone, Medical dial; engine coefficients).
   */
  training: { perDay: 0.0017 },
  /** Matchday squad selection (SPEC §9): slot OVR minus these penalties. */
  selection: {
    /** OVR points off per point of condition below 100, in a match of importance 1. */
    fatiguePerPoint: 0.3,
    /** OVR points off a regular starter per unit of importance below 1 (rest in small games). */
    restRegulars: 8,
    /** A match this many days ahead counts as "coming up" (congestion). */
    congestionDays: 4,
    /** Below this condition a player isn't picked to start unless there's no one else. */
    minStartCondition: 55,
  },
  /** How much a match matters to a club (mid-term view, SPEC §9). 1 = an ordinary league match. */
  importance: {
    cupEarly: 0.65,
    cupQuarterFinal: 0.9,
    cupSemiFinal: 1.2,
    final: 1.5,
    playoff: 1.5,
    /** From this share of the league season played, stakes change importance. */
    lateSeason: 0.7,
    /** Within this many points of a position that matters (title, promotion, play-offs, drop). */
    stakesPoints: 6,
    stakes: 1.25,
    nothingToPlayFor: 0.85,
    /**
     * League matches against a much weaker side matter less (big clubs rotate against
     * small ones): × factor once the club's top-11 OVR is `full` points above the
     * opponent's, phasing in from `from`.
     */
    weakOpponent: { from: 4, full: 10, factor: 0.85 },
  },
};

export type SquadCoefficients = typeof SQUAD_COEFFICIENTS;
