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
  homeAdvantage: 0.09,
  /** Log-odds per 10 points of team-rating difference, per chain step. */
  slope: 0.22,

  buildUp: {
    /** Short build-up from the defensive third: Passing vs Pressing. */
    base: 1.55,
    /** Share of build-ups played long at directness 0, and change per directness step. */
    longBallShare: 0.14,
    longBallPerDirectness: 0.09,
    /** Long ball: long passing + aerial/speed of the front vs the opposing defence. */
    longBallBase: -0.25,
    /** A successful long ball lands straight in the final third this often. */
    longBallToFinalThird: 0.22,
    /** Short-passing bonus per step of directness towards short (−). */
    shortBonusPerStep: 0.08,
  },
  progression: {
    /** Middle third → final third: Passing vs Defence. */
    base: 0.2,
  },
  chance: {
    /** Final third → shot: Attack vs Defence. */
    base: -1.08,
    /** Direct play makes quicker but scrappier chances: log-odds per directness step. */
    directPenalty: 0.07,
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
    central: 0.153,
    header: 0.087,
    dribble: 0.12,
    longShot: 0.036,
    rebound: 0.2,
    /** Log-normal spread of chance quality within a type. */
    spread: 0.55,
    /** Defensive pressure: xG × exp(−k × (Defence − Attack) / 10). */
    pressure: 0.09,
    /**
     * Shooter vs his own team's attack (how good a finisher he is for this side):
     * xG × exp(k × (skill − Attack) / 10). The matchup itself is the pressure term.
     */
    shooter: 0.1,
    min: 0.01,
    max: 0.9,
  },
  /** Keeper vs the attack he faces: goal probability = xG × exp(−k × (Goalkeeping − Attack) / 10). */
  keeper: { k: 0.085 },
  /** Of shots that miss: share saved, blocked (rest off target), before type adjustments. */
  shotOutcome: { saved: 0.25, blocked: 0.28, longShotBlockedBonus: 0.08, headerBlockedFactor: 0.4 },

  /**
   * How a lost ball is won back, per phase (the rest are loose balls and passes out of
   * play, credited to no defender). Interceptions and loose balls count as failed passes.
   */
  turnovers: {
    buildUp: { interception: 0.2, tackle: 0.27, clearance: 0 },
    progression: { interception: 0.2, tackle: 0.27, clearance: 0 },
    chance: { interception: 0.22, tackle: 0.25, clearance: 0.3 },
  },
  /** Misplaced passes within possessions that are kept, as a share of all passes. */
  passFailureBase: 0.06,

  /** Chance types in the final third (weights before team-composition factors). */
  chanceMix: { central: 1, cross: 0.55, dribble: 0.35, longShot: 0.45, crossPerDirectness: 0.12 },

  /** In-play seconds per phase, and dead-ball seconds after each outcome. */
  time: {
    buildUp: 15,
    longBall: 6,
    progression: 14,
    chance: 10,
    failedPhase: 7,
    /** Possessions take this much longer per step towards short passing (−directness). */
    perDirectness: 0.08,
    deadAfterTurnover: 9,
    deadAfterGoal: 55,
    deadAfterShotOff: 24,
    deadAfterSave: 12,
    secondsPerPass: 4.2,
    /** Passing tempo: seconds per pass × (1 + this × directness) (short passing = more passes). */
    passTempoPerDirectness: 0.1,
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
  energy: {
    physicalLoss: 0.15,
    otherLoss: 0.075,
    /** Energy lost per match minute for an average player (before modifiers). */
    drainPerMinute: 0.0042,
    /** Endurance: drain × (enduranceBase − enduranceSpan × end/100). */
    enduranceBase: 1.3,
    enduranceSpan: 0.6,
    /** Work rate: drain × (1 + workRate × (wrk − 50) / 50). */
    workRate: 0.15,
    /** Pressing slider: drain × (1 + pressing × step). */
    pressing: 0.08,
    floor: 0.15,
    /** Team ratings and pickers are refreshed from energy this often (seconds of clock). */
    refreshEvery: 180,
  },

  fouls: {
    /** Per contested phase: chance the defending side commits a foul. */
    buildUp: 0.04,
    progression: 0.063,
    chance: 0.086,
    /** Foul chance × (1 + this × pressing step) for the defending side. */
    pressingPerStep: 0.1,
    /** Foul chance × (1 + this × hotheads on the pitch). */
    hotheadTeam: 0.12,
    /** Dead time after a foul (free kick), seconds. */
    dead: 22,
  },
  cards: {
    /** Chance a foul is booked, by phase (fouls stopping attacks are booked more). */
    yellow: { buildUp: 0.12, progression: 0.2, chance: 0.24 },
    hothead: 1.6,
    /** Straight red per foul, and for a professional foul in the final third. */
    red: 0.0019,
    redInChance: 0.0038,
    /** A booked player fouls less afterwards, and is booked less readily (referees' leeway). */
    bookedFoulFactor: 0.4,
    bookedYellowFactor: 0.45,
  },
  setPiece: {
    /** Corner or crossed free kick → attempt on goal: (Aerial and Set Pieces) vs Aerial. */
    base: -0.55,
    setPiecesShare: 0.4,
    /** Header xG from a set piece, × the open-play header base. */
    xgFactor: 1.05,
    /** Cleared set pieces fall back to the attackers this often. */
    secondBall: 0.28,
    /** Corners won: from saved shots, blocked shots and failed final-third play. */
    cornerFromSave: 0.3,
    cornerFromBlock: 0.38,
    cornerFromChanceLoss: 0.13,
    cornerDead: 26,
    /** Free kicks in the final third (fouls in the chance phase). */
    penaltyShare: 0.038,
    directShot: 0.3,
    crossed: 0.5,
    freeKickXg: 0.06,
    freeKickBlocked: 0.38,
  },
  penalty: {
    /** Goal chance = base + slope × (taker's pen − keeper's gko/gkr) / 10. */
    base: 0.78,
    slope: 0.03,
    xg: 0.78,
    /** Shoot-outs: sudden-death kicks are a little harder. */
    shootoutBase: 0.76,
    suddenDeath: 0.03,
  },
  injuries: {
    /** Injuries per player-minute at full energy, before modifiers (~0.28 per team-match). */
    perMinute: 0.00029,
    /** Risk × (1 + tired × (1 − energy)); × (1 + sharp × how far below 0.75 energy). */
    tired: 1.2,
    sharp: 3,
    injuryProne: 2,
    /** Medical dial 0–100 → risk × (1.15 − 0.3 × dial/100). */
    medicalBase: 1.15,
    medicalSpan: 0.3,
  },
  /**
   * Match ratings (SPEC §8.7): 6.0 plus contributions, then centred on what's normal for
   * the position (expected), so every position averages ~6.6. Cameos regress to 6.6.
   */
  ratings: {
    goal: 1,
    assist: 0.6,
    keyPass: 0.12,
    shotOnTarget: 0.08,
    shotOff: -0.03,
    dribbleWon: 0.05,
    dribbleLost: -0.03,
    tackle: 0.07,
    interception: 0.07,
    clearance: 0.03,
    block: 0.08,
    aerialWon: 0.025,
    progressivePass: 0.02,
    passCompleted: 0.002,
    passFailed: -0.015,
    save: 0.22,
    keeperConceded: -0.28,
    defenderConceded: -0.12,
    keeperCleanSheet: 0.6,
    defenderCleanSheet: 0.35,
    yellow: -0.3,
    red: -1.2,
    foul: -0.04,
    foulWon: 0.03,
    win: 0.25,
    loss: -0.25,
    /** Raw score that's average for each position (centring), calibrated by the harness. */
    expected: {
      GK: 6.39,
      CB: 6.59,
      FB: 6.43,
      WB: 6.47,
      DM: 6.62,
      CM: 6.72,
      WM: 6.55,
      AM: 6.86,
      W: 6.59,
      ST: 6.68,
    },
    /** Minutes for a full-weight rating; fewer pull the rating toward 6.6. */
    fullWeightMinutes: 60,
  },
  ai: {
    /** Minute ranges for planned substitution windows (uniform within). */
    firstWindow: [58, 66],
    secondWindow: [70, 78],
    /** Late fresh legs: chance to use leftover subs around this minute. */
    lateWindow: [84, 88],
    lateUseChance: 0.6,
    /** A tired player is replaced when a fresh substitute is within this many OVR points. */
    freshLegsMargin: 3,
    /** Minutes from which teams chase a deficit or protect a lead. */
    chaseFrom: 65,
    protectFrom: 75,
    /** Level late on: a side at least this much stronger pushes for the winner. */
    pushForWinFrom: 70,
    pushForWinEdge: 3,
    checkEvery: 300,
  },
};

export type Coefficients = typeof COEFFICIENTS;
