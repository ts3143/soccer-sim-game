/**
 * One possession (SPEC §8.1): start zone → build-up (or a long ball) → progression →
 * chance creation → shot with xG → outcome. Fouls can interrupt any phase; in the final
 * third they become free kicks or penalties. Saved and blocked shots and cleared attacks
 * can win corners. Team ratings set each step's odds; player ratings decide who acts,
 * and every action is credited to a player's stats (SPEC §10.1).
 */
import { RATING_INDEX as R } from "../../common/config/ratings";
import type { Random } from "../core/random";
import { sendOff } from "./manager";
import {
  avg,
  clamp,
  emit,
  onPitch,
  pick,
  refreshTeam,
  sigmoid,
  type ChanceKind,
  type MatchState,
  type PlayerState,
  type TeamState,
  type Zone,
} from "./state";
import type { ShotOutcome, ShotType, TeamSide } from "./types";

type Phase = "buildUp" | "progression" | "chance";

interface PossessionEnd {
  ball: TeamSide;
  zone: Zone;
  dead: number;
}

const otherSide = (side: TeamSide): TeamSide => (side === 0 ? 1 : 0);

function startZoneFrom(rng: Random, shares: { def: number; mid: number; att: number }): Zone {
  const r = rng.next() * (shares.def + shares.mid + shares.att);
  if (r < shares.def) return "def";
  if (r < shares.def + shares.mid) return "mid";
  return "att";
}

function chooseChance(rng: Random, team: TeamState, crossPerDirectness: number): ChanceKind {
  const mix = team.chanceMix;
  const cross = mix.cross * (1 + crossPerDirectness * team.sliders.directness);
  const r = rng.next() * (mix.central + cross + mix.dribble + mix.longShot);
  if (r < mix.central) return "central";
  if (r < mix.central + cross) return "cross";
  if (r < mix.central + cross + mix.dribble) return "dribble";
  return "longShot";
}

export const keeperOf = (team: TeamState): PlayerState | null => {
  const index = team.plan.formation.slots.findIndex((slot) => slot.position === "GK");
  return team.slots[index] ?? null;
};

// ---------------------------------------------------------------------------
// Ball won back: credit the defender (tackle, interception, clearance) or nobody (a loose
// ball), and the attacker whose pass went astray.

type Winner = "presser" | "midDefender" | "boxDefender";

function ballWon(
  s: MatchState,
  att: TeamState,
  def: TeamState,
  phase: Phase,
  picker: Winner,
): void {
  const split = s.c.turnovers[phase];
  const r = s.rng.next();
  if (r < split.tackle) {
    const winner = pick(s.rng, def.pickers[picker]);
    if (winner) winner.stats.tackles++;
    return;
  }
  if (r < split.tackle + split.interception) {
    const winner = pick(s.rng, def.pickers[picker]);
    if (winner) winner.stats.interceptions++;
  } else if (r < split.tackle + split.interception + split.clearance) {
    const winner = pick(s.rng, def.pickers.boxDefender);
    if (winner) winner.stats.clearances++;
  }
  failedPass(s, att);
}

function failedPass(s: MatchState, att: TeamState, passer?: PlayerState | null) {
  const p = passer ?? pick(s.rng, att.pickers.passer);
  if (p) p.passesFailed++;
}

function progressivePass(s: MatchState, att: TeamState) {
  const p = pick(s.rng, att.pickers.progressive);
  if (p) p.stats.progressivePasses++;
}

function aerialClear(s: MatchState, def: TeamState) {
  const p = pick(s.rng, def.pickers.aerialDefender);
  if (p) {
    p.stats.aerialsWon++;
    p.stats.clearances++;
  }
}

// ---------------------------------------------------------------------------
// Fouls and cards

/** The defending side may foul. Returns true if it did (cards handled here). */
function foul(s: MatchState, att: TeamState, def: TeamState, phase: Phase): boolean {
  const { c, rng } = s;
  const p =
    c.fouls[phase] *
    s.input.style.foulRate *
    (1 + c.fouls.pressingPerStep * def.sliders.pressing) *
    (1 + c.fouls.hotheadTeam * def.hotheadsOnPitch);
  if (!rng.bool(p)) return false;
  const fouler = pick(rng, def.pickers.fouler);
  if (!fouler) return false;
  const victim = pick(rng, att.pickers.fouled);
  fouler.stats.fouls++;
  def.stats.fouls++;
  if (victim) victim.stats.foulsWon++;
  emit(
    s,
    {
      type: "foul",
      clock: s.clock,
      side: def.side,
      pid: fouler.input.pid,
      victimPid: victim?.input.pid ?? null,
    },
    false,
  );

  const hothead = fouler.input.hothead ? c.cards.hothead : 1;
  if (rng.bool((phase === "chance" ? c.cards.redInChance : c.cards.red) * hothead)) {
    sendOff(s, def, fouler, "red");
  } else if (
    rng.bool(c.cards.yellow[phase] * hothead * (fouler.booked ? c.cards.bookedYellowFactor : 1))
  ) {
    if (fouler.booked) {
      sendOff(s, def, fouler, "secondYellow");
    } else {
      fouler.booked = true;
      fouler.stats.yellowCards++;
      def.stats.yellowCards++;
      emit(
        s,
        { type: "card", clock: s.clock, side: def.side, pid: fouler.input.pid, card: "yellow" },
        true,
      );
      refreshTeam(def, c);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Shots

interface ShotSpec {
  shotType: ShotType;
  shooter: PlayerState;
  assister: PlayerState | null;
  xg: number;
  /** Chance a non-goal is blocked (rest: saved or off target). */
  blocked: number;
}

function xgFor(s: MatchState, att: TeamState, def: TeamState, base: number, skill: number): number {
  const c = s.c;
  return clamp(
    base *
      Math.exp(c.xg.spread * s.rng.normal() - (c.xg.spread * c.xg.spread) / 2) *
      Math.exp((-c.xg.pressure * (def.ratings.defence - att.ratings.attack)) / 10) *
      Math.exp((c.xg.shooter * (skill - att.ratings.attack)) / 10) *
      s.input.style.chanceQuality,
    c.xg.min,
    c.xg.max,
  );
}

/**
 * Open-play attempt of a given kind. The creator (crosser or dribbler) is chosen first:
 * the chance can fail before the shot, and both outcomes go into the stats.
 */
function openPlay(
  s: MatchState,
  att: TeamState,
  def: TeamState,
  kind: ChanceKind,
  succeeds: boolean,
): ShotSpec | null {
  const { c, rng } = s;
  if (kind === "cross") {
    const crosser = pick(rng, att.pickers.assistCross);
    if (crosser) crosser.stats.crosses++;
    if (!succeeds) {
      aerialClear(s, def);
      failedPass(s, att, crosser);
      return null;
    }
    const shooter = pick(rng, att.pickers.header, crosser);
    if (!shooter) return null;
    shooter.stats.aerialsWon++;
    return {
      shotType: "header",
      shooter,
      assister: crosser,
      xg: xgFor(s, att, def, c.xg.header, avg(shooter.eff, "hdr", "jmp")),
      blocked: c.shotOutcome.blocked * c.shotOutcome.headerBlockedFactor,
    };
  }
  if (kind === "dribble") {
    const dribbler = pick(rng, att.pickers.dribble);
    if (!dribbler) return null;
    dribbler.stats.dribbles++;
    if (!succeeds) {
      const winner = pick(rng, def.pickers.boxDefender);
      if (winner) winner.stats.tackles++;
      return null;
    }
    dribbler.stats.dribblesCompleted++;
    const assister = rng.bool(c.assistShare.dribble)
      ? pick(rng, att.pickers.assistCentral, dribbler)
      : null;
    return {
      shotType: "dribble",
      shooter: dribbler,
      assister,
      xg: xgFor(s, att, def, c.xg.dribble, dribbler.eff[R.fin] as number),
      blocked: c.shotOutcome.blocked,
    };
  }
  if (!succeeds) {
    ballWon(s, att, def, "chance", kind === "central" ? "boxDefender" : "midDefender");
    return null;
  }
  const shooter = pick(rng, att.pickers[kind]);
  if (!shooter) return null;
  // A certain assist draws no random number (keeps the M2 sequences when the share is 1).
  const share = kind === "central" ? c.assistShare.central : c.assistShare.other;
  const assister =
    share >= 1 || rng.bool(share) ? pick(rng, att.pickers.assistCentral, shooter) : null;
  const skill =
    kind === "longShot" ? (shooter.eff[R.lsh] as number) : (shooter.eff[R.fin] as number);
  return {
    shotType: kind,
    shooter,
    assister,
    xg: xgFor(s, att, def, c.xg[kind], skill),
    blocked: c.shotOutcome.blocked + (kind === "longShot" ? c.shotOutcome.longShotBlockedBonus : 0),
  };
}

/** Resolves a shot and records it. Penalties use their own goal chance. */
function resolveShot(
  s: MatchState,
  att: TeamState,
  def: TeamState,
  shot: ShotSpec,
  pGoalOverride?: number,
): ShotOutcome {
  const { c, rng } = s;
  const pGoal =
    pGoalOverride ??
    clamp(
      shot.xg * Math.exp((-c.keeper.k * (def.ratings.goalkeeping - att.ratings.attack)) / 10),
      0.005,
      0.95,
    );
  let outcome: ShotOutcome;
  if (rng.bool(pGoal)) {
    outcome = "goal";
  } else if (shot.shotType === "penalty") {
    outcome = rng.bool(0.65) ? "saved" : "off";
  } else {
    const r = rng.next();
    const blocked = clamp(shot.blocked, 0, 0.9);
    outcome =
      r < c.shotOutcome.saved ? "saved" : r < c.shotOutcome.saved + blocked ? "blocked" : "off";
  }

  const { shooter, assister, xg } = shot;
  shooter.stats.shots++;
  shooter.stats.xg += xg;
  att.stats.shots++;
  att.stats.xg += xg;
  if (assister) {
    assister.stats.keyPasses++;
    assister.stats.xa += xg;
  }
  if (outcome === "goal" || outcome === "saved") {
    shooter.stats.shotsOnTarget++;
    att.stats.shotsOnTarget++;
  }
  if (outcome === "saved") {
    const keeper = keeperOf(def);
    if (keeper) keeper.stats.saves++;
  } else if (outcome === "blocked") {
    const blocker = pick(rng, def.pickers.boxDefender);
    if (blocker) blocker.stats.blocks++;
  }
  const clock = s.clock;
  const assistPid = assister?.input.pid ?? null;
  emit(
    s,
    {
      type: "shot",
      clock,
      side: att.side,
      pid: shooter.input.pid,
      assistPid,
      shotType: shot.shotType,
      xg,
      outcome,
    },
    false,
  );
  if (outcome === "goal") {
    shooter.stats.goals++;
    att.stats.goals++;
    s.score[att.side]++;
    if (assister) assister.stats.assists++;
    if (shot.shotType === "penalty") att.stats.penaltiesScored++;
    for (const p of onPitch(def)) p.stats.goalsConceded++;
    emit(
      s,
      {
        type: "goal",
        clock,
        side: att.side,
        pid: shooter.input.pid,
        assistPid,
        penalty: shot.shotType === "penalty",
      },
      true,
    );
  }
  return outcome;
}

function takePenalty(s: MatchState, att: TeamState, def: TeamState): ShotOutcome {
  const c = s.c;
  const taker = att.penaltyTaker ?? keeperOf(att);
  if (!taker) return "off";
  const keeper = keeperOf(def);
  const keeperSkill = keeper ? avg(keeper.eff, "gko", "gkr") : 20;
  const pGoal = clamp(
    c.penalty.base + (c.penalty.slope * ((taker.eff[R.pen] as number) - keeperSkill)) / 10,
    0.55,
    0.95,
  );
  return resolveShot(
    s,
    att,
    def,
    { shotType: "penalty", shooter: taker, assister: null, xg: c.penalty.xg, blocked: 0 },
    pGoal,
  );
}

/** A corner or crossed free kick: (Aerial and Set Pieces) vs Aerial decides if it becomes a header. */
function setPieceDelivery(s: MatchState, att: TeamState, def: TeamState): ShotOutcome | "cleared" {
  const { c, rng } = s;
  const A = att.ratings;
  const attackQuality =
    (1 - c.setPiece.setPiecesShare) * A.aerial + c.setPiece.setPiecesShare * A.setPieces;
  const home = s.input.neutralVenue ? 0 : att.side === 0 ? c.homeAdvantage : -c.homeAdvantage;
  const taker = att.setPieceTaker;
  if (taker) taker.stats.crosses++;
  if (
    !rng.bool(
      sigmoid(c.setPiece.base + (c.slope / 10) * (attackQuality - def.ratings.aerial) + home),
    )
  ) {
    aerialClear(s, def);
    return "cleared";
  }
  const shooter = pick(rng, att.pickers.header, taker);
  if (!shooter) return "cleared";
  shooter.stats.aerialsWon++;
  // Flick-ons and second balls: not every set-piece header is the taker's assist.
  const share = c.assistShare.setPiece;
  const credited = share >= 1 || rng.bool(share);
  return resolveShot(s, att, def, {
    shotType: "header",
    shooter,
    assister: taker && taker !== shooter && credited ? taker : null,
    xg: xgFor(s, att, def, c.xg.header * c.setPiece.xgFactor, avg(shooter.eff, "hdr", "jmp")),
    blocked: c.shotOutcome.blocked * c.shotOutcome.headerBlockedFactor,
  });
}

function directFreeKick(s: MatchState, att: TeamState, def: TeamState): ShotOutcome {
  const c = s.c;
  const taker = att.setPieceTaker;
  if (!taker) return "off";
  const skill = 0.6 * (taker.eff[R.stp] as number) + 0.4 * (taker.eff[R.lsh] as number);
  return resolveShot(s, att, def, {
    shotType: "freeKick",
    shooter: taker,
    assister: null,
    xg: xgFor(s, att, def, c.setPiece.freeKickXg, skill),
    blocked: c.setPiece.freeKickBlocked,
  });
}

// ---------------------------------------------------------------------------
// The possession

type AttackStep = "chance" | "corner" | "freeKick" | "penalty";

export function runPossession(s: MatchState): { inPlay: number; dead: number } {
  const { c, rng } = s;
  const att = s.teams[s.ball];
  const defSide = otherSide(s.ball);
  const def = s.teams[defSide];
  const k = c.slope / 10;
  const home = s.input.neutralVenue ? 0 : s.ball === 0 ? c.homeAdvantage : -c.homeAdvantage;
  const directness = att.sliders.directness;
  let inPlay = 0;
  let dead = 0;
  let zone = s.zone;
  let end: PossessionEnd | null = null;
  const lose = (shares: { def: number; mid: number; att: number }): PossessionEnd => ({
    ball: defSide,
    zone: startZoneFrom(rng, shares),
    dead: c.time.deadAfterTurnover,
  });
  att.stats.possessions++;

  // Build-up from the defensive third: short passing or a long ball.
  for (let tries = 0; zone === "def" && !end && tries < 3; tries++) {
    if (foul(s, att, def, "buildUp")) {
      dead += c.fouls.dead;
      continue;
    }
    const longShare = clamp(
      c.buildUp.longBallShare + c.buildUp.longBallPerDirectness * directness,
      0.02,
      0.6,
    );
    if (rng.bool(longShare)) {
      inPlay += c.time.longBall;
      const p = sigmoid(
        c.buildUp.longBallBase +
          k *
            (0.5 * (att.ratings.aerial + att.ratings.passing) -
              0.5 * (def.ratings.aerial + def.ratings.defence)) +
          home +
          c.sliders.pressingExposure * def.sliders.pressing,
      );
      if (rng.bool(p)) {
        progressivePass(s, att);
        if (rng.bool(0.5)) {
          const target = pick(rng, att.pickers.header);
          if (target) target.stats.aerialsWon++;
        }
        zone = rng.bool(c.buildUp.longBallToFinalThird) ? "att" : "mid";
      } else {
        aerialClear(s, def);
        failedPass(s, att);
        end = lose(c.startZone.afterProgressionLoss);
      }
    } else {
      inPlay += c.time.buildUp;
      const p = sigmoid(
        c.buildUp.base +
          k * (att.ratings.passing - def.ratings.pressing) +
          home -
          c.buildUp.shortBonusPerStep * directness,
      );
      if (rng.bool(p)) {
        progressivePass(s, att);
        zone = "mid";
      } else {
        ballWon(s, att, def, "buildUp", "presser");
        end = lose(c.startZone.afterBuildUpLoss);
      }
    }
  }
  if (zone === "def" && !end) zone = "mid"; // repeated free kicks carry them through

  // Progression through the middle third.
  for (let tries = 0; zone === "mid" && !end && tries < 3; tries++) {
    if (foul(s, att, def, "progression")) {
      dead += c.fouls.dead;
      continue;
    }
    inPlay += c.time.progression;
    const p = sigmoid(c.progression.base + k * (att.ratings.passing - def.ratings.defence) + home);
    if (rng.bool(p)) {
      progressivePass(s, att);
      zone = "att";
    } else {
      ballWon(s, att, def, "progression", "midDefender");
      end = lose(c.startZone.afterProgressionLoss);
    }
  }

  // The final third (reached, or carried there by repeated free kicks): chances, set
  // pieces and their follow-ups.
  let step: AttackStep = "chance";
  for (let guard = 0; !end && guard < 6; guard++) {
    let outcome: ShotOutcome | "cleared";
    if (step === "chance") {
      inPlay += guard === 0 ? c.time.chance : c.time.failedPhase;
      if (foul(s, att, def, "chance")) {
        dead += c.fouls.dead;
        step = rng.bool(c.setPiece.penaltyShare) ? "penalty" : "freeKick";
        continue;
      }
      const kind = chooseChance(rng, att, c.chanceMix.crossPerDirectness);
      const succeeds = rng.bool(
        sigmoid(
          c.chance.base +
            k * (att.ratings.attack - def.ratings.defence) +
            home -
            c.chance.directPenalty * Math.max(0, directness),
        ),
      );
      const shot = openPlay(s, att, def, kind, succeeds);
      if (!shot) {
        if (rng.bool(c.setPiece.cornerFromChanceLoss)) {
          step = "corner";
          continue;
        }
        end = lose(c.startZone.afterChanceLoss);
        break;
      }
      outcome = resolveShot(s, att, def, shot);
    } else if (step === "corner") {
      att.stats.corners++;
      emit(s, { type: "corner", clock: s.clock, side: att.side }, false);
      dead += c.setPiece.cornerDead;
      outcome = setPieceDelivery(s, att, def);
    } else if (step === "freeKick") {
      const r = rng.next();
      if (r < c.setPiece.directShot) outcome = directFreeKick(s, att, def);
      else if (r < c.setPiece.directShot + c.setPiece.crossed)
        outcome = setPieceDelivery(s, att, def);
      else {
        step = "chance"; // played short
        continue;
      }
    } else {
      att.stats.penaltiesAwarded++;
      emit(
        s,
        {
          type: "penaltyAwarded",
          clock: s.clock,
          side: att.side,
          pid: att.penaltyTaker?.input.pid ?? null,
        },
        false,
      );
      dead += 50;
      outcome = takePenalty(s, att, def);
    }

    // What follows the attempt.
    if (outcome === "goal") {
      end = { ball: defSide, zone: "mid", dead: c.time.deadAfterGoal };
    } else if (outcome === "saved") {
      if (rng.bool(c.setPiece.cornerFromSave)) step = "corner";
      else end = { ball: defSide, zone: "def", dead: c.time.deadAfterSave };
    } else if (outcome === "blocked") {
      if (rng.bool(c.setPiece.cornerFromBlock)) step = "corner";
      else if (rng.bool(c.chance.reboundRetained)) step = "chance";
      else
        end = {
          ball: defSide,
          zone: rng.bool(0.6) ? "def" : "mid",
          dead: c.time.deadAfterTurnover,
        };
    } else if (outcome === "cleared") {
      if (rng.bool(c.setPiece.secondBall)) step = "chance";
      else end = lose(c.startZone.afterChanceLoss);
    } else {
      end = { ball: defSide, zone: "def", dead: c.time.deadAfterShotOff };
    }
  }
  end ??= lose(c.startZone.afterChanceLoss);

  // Passes: spread over the players on the ball, by their share of the team's passing.
  const timeScale = 1 - c.time.perDirectness * directness;
  const seconds = inPlay * timeScale;
  const passes = Math.max(
    1,
    seconds / (c.time.secondsPerPass * (1 + c.time.passTempoPerDirectness * directness)),
  );
  for (const p of onPitch(att)) {
    p.passShareAcc += passes * p.passShare;
    p.passFailAcc += passes * p.passShare * c.passFailureBase;
  }
  att.possessionSeconds += seconds;
  s.inPlaySeconds += seconds;
  s.ball = end.ball;
  s.zone = end.zone;
  return { inPlay: seconds, dead: dead + end.dead };
}
