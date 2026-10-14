/**
 * Every tunable number in the match engine, in one place. The calibration harness
 * (`pnpm calibrate`) can pass a modified copy to the engine for tuning runs; the
 * values committed here are the tuned ones (CLAUDE.md: tune coefficients, never
 * results). Spec-level rules (substitution limits, style modifiers, formations) live
 * in data/config, not here.
 *
 * Logits: step probabilities are sigmoid(base + slope × (attack − defence) / 10 + …),
 * so +10 rating points on one side shifts the log-odds by `slope`.
 */
export const COEFFICIENTS = {
  /** Log-odds bonus for the home side on each contested step (0 at neutral venues). */
  homeAdvantage: 0.12,
  /** Log-odds per 10 points of team-rating difference, per chain step. */
  slope: 0.38,

  buildUp: {
    /** Short build-up from the defensive third: Passing vs Pressing. */
    base: 1.55,
    /** Share of build-ups played long at directness 0, and change per directness step. */
    longBallShare: 0.14,
    longBallPerDirectness: 0.09,
    /** Long ball: long passing + aerial/speed of the front vs the opposing defence. */
    longBallBase: 0.1,
    /** A successful long ball lands straight in the final third this often. */
    longBallToFinalThird: 0.3,
    /** Short-passing bonus per step of directness towards short (−). */
    shortBonusPerStep: 0.08,
  },
  progression: {
    /** Middle third → final third: Passing vs Defence. */
    base: 0.2,
  },
  chance: {
    /** Final third → shot: Attack vs Defence. */
    base: -0.45,
    /** A blocked shot falls back to the attackers (another chance) this often. */
    reboundRetained: 0.33,
  },

  /** Where possessions start after each kind of turnover (shares of def/mid/att third). */
  startZone: {
    afterBuildUpLoss: { def: 0, mid: 0.35, att: 0.65 },
    afterProgressionLoss: { def: 0.45, mid: 0.55, att: 0 },
    afterChanceLoss: { def: 1, mid: 0, att: 0 },
  },

  xg: {
    /** Base xG by shot type before pressure, shooter and league chance quality. */
    central: 0.15,
    header: 0.085,
    dribble: 0.12,
    longShot: 0.035,
    rebound: 0.2,
    /** Log-normal spread of chance quality within a type. */
    spread: 0.55,
    /** Defensive pressure: xG × exp(−k × (Defence − Attack) / 10). */
    pressure: 0.12,
    /** Shooter: xG × exp(k × (skill − 60) / 10). */
    shooter: 0.1,
    min: 0.01,
    max: 0.9,
  },
  /** Goal probability = xG × exp(−k × (keeper − reference) / 10). */
  keeper: { k: 0.1, reference: 63 },
  /** Of shots that miss: share saved, blocked (rest off target), before type adjustments. */
  shotOutcome: { saved: 0.25, blocked: 0.28, longShotBlockedBonus: 0.08, headerBlockedFactor: 0.4 },

  /** Chance types in the final third (weights before team-composition factors). */
  chanceMix: { central: 1, cross: 0.55, dribble: 0.35, longShot: 0.45, crossPerDirectness: 0.12 },

  /** In-play seconds per phase, and dead-ball seconds after each outcome. */
  time: {
    buildUp: 13,
    longBall: 6,
    progression: 12,
    chance: 9,
    failedPhase: 7,
    /** Possessions take this much longer per step towards short passing (−directness). */
    perDirectness: 0.08,
    deadAfterTurnover: 4,
    deadAfterGoal: 55,
    deadAfterShotOff: 24,
    deadAfterSave: 12,
    secondsPerPass: 4.2,
  },
  /** Added time, in minutes (uniform between min and max). */
  addedTime: { firstHalf: [1, 4], secondHalf: [2, 7] },

  sliders: {
    /** Team-rating points per slider step. */
    mentalityAttack: 2.2,
    mentalityDefence: 2.2,
    pressingRating: 3,
    /** Direct (+) teams lose Passing, short (−) teams gain it, per step. */
    directnessPassing: 1.2,
    /** Pressing high leaves space behind: opponent long-ball log-odds per pressing step. */
    pressingExposure: 0.12,
  },

  /** Physical ratings lose this share at zero energy; technical and mental half as much. */
  energy: { physicalLoss: 0.15, otherLoss: 0.075 },
};

export type Coefficients = typeof COEFFICIENTS;
