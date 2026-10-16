/**
 * Everything that changes a team during a match: red cards, energy drain, injuries,
 * substitutions (the real rule: 5 in normal time in at most 3 windows, half-time free;
 * extra time adds a 6th sub and a 4th window) and the AI's in-game decisions (SPEC §8.5):
 * replace injured players, fatigue subs around 60–75', chase a deficit, protect a lead.
 */
import { formationsConfig, type FormationSlot } from "../../common/config/formations";
import type { Random } from "../core/random";
import { RATING_INDEX as R, type Position } from "../../common/config/ratings";
import { rawPositionOvr, wrongFootPenalty } from "../core/ovr";
import {
  clamp,
  currentMinute,
  emit,
  onPitch,
  refreshTeam,
  type MatchState,
  type PlayerState,
  type TeamState,
} from "./state";

/** How hard each position works (energy drain multiplier). */
const POSITION_DRAIN: Record<Position, number> = {
  GK: 0.35, CB: 0.85, FB: 1.1, WB: 1.15, DM: 1.05, CM: 1.1, WM: 1.1, AM: 1, W: 1.05, ST: 0.95,
}; // prettier-ignore

const slotOf = (team: TeamState, p: PlayerState): FormationSlot | undefined =>
  p.slot === null ? undefined : team.plan.formation.slots[p.slot];

/** A player's quality in a slot with his current (energy-adjusted) ratings. */
function slotQuality(team: TeamState, p: PlayerState, slotIndex: number): number {
  const slot = team.plan.formation.slots[slotIndex] as FormationSlot;
  return (
    rawPositionOvr(p.eff, slot.position) - wrongFootPenalty(slot.position, slot.side, p.input.foot)
  );
}

// ---------------------------------------------------------------------------
// Red cards

export function sendOff(
  s: MatchState,
  team: TeamState,
  p: PlayerState,
  card: "red" | "secondYellow",
): void {
  p.sentOff = true;
  p.stats.redCards++;
  if (card === "secondYellow") {
    // A second yellow counts as a yellow and the red.
    p.stats.yellowCards++;
    team.stats.yellowCards++;
  }
  team.stats.redCards++;
  if (p.slot !== null) team.slots[p.slot] = null;
  p.slot = null;
  p.offMinute = currentMinute(s);
  p.stats.energyEnd = p.energy;
  emit(s, { type: "card", clock: s.clock, side: team.side, pid: p.input.pid, card }, true);
  team.needsAttention = true;
  refreshTeam(team, s.c);
}

// ---------------------------------------------------------------------------
// Energy and injuries

/** Drains energy for `minutes` of play and checks for injuries. */
export function playMinutes(s: MatchState, minutes: number): void {
  const { c, rng } = s;
  for (const team of s.teams) {
    const pressing = 1 + c.energy.pressing * team.sliders.pressing;
    let hazard = 0;
    const risks: number[] = [];
    const players = onPitch(team);
    for (const p of players) {
      const slot = slotOf(team, p);
      const drain =
        c.energy.drainPerMinute *
        (c.energy.enduranceBase -
          (c.energy.enduranceSpan * (p.input.ratings[R.end] as number)) / 100) *
        (1 + (c.energy.workRate * ((p.input.ratings[R.wrk] as number) - 50)) / 50) *
        pressing *
        (slot ? POSITION_DRAIN[slot.position] : 1);
      p.energy = Math.max(c.energy.floor, p.energy - drain * minutes);
      const below = Math.max(0, 0.75 - p.energy) / 0.25;
      const risk =
        c.injuries.perMinute *
        (1 + c.injuries.tired * (1 - p.energy)) *
        (1 + c.injuries.sharp * below) *
        (p.input.injuryProne ? c.injuries.injuryProne : 1) *
        (c.injuries.medicalBase - (c.injuries.medicalSpan * team.input.medicalDial) / 100) *
        minutes;
      risks.push(risk);
      hazard += risk;
    }
    if (hazard > 0 && rng.bool(hazard)) {
      let r = rng.next() * hazard;
      let index = 0;
      while (index < risks.length - 1 && (r -= risks[index] as number) > 0) index++;
      const victim = players[index];
      if (victim && !victim.injured) injure(s, team, victim);
    }
  }
}

/**
 * Days out for an injury (in matches and in training): most 1–3 weeks, ~10% four weeks
 * or more, rarely the rest of the season.
 */
export function drawInjuryDays(rng: Random): number {
  const r = rng.next();
  if (r < 0.25) return rng.int(2, 6);
  if (r < 0.87) return rng.int(7, 21);
  if (r < 0.98) return rng.int(28, 84);
  return rng.int(120, 270);
}

function injuryDays(s: MatchState): number {
  return drawInjuryDays(s.rng);
}

function injure(s: MatchState, team: TeamState, p: PlayerState): void {
  p.injured = true;
  p.stats.injuryDays = injuryDays(s);
  team.stats.injuries++;
  team.needsAttention = true;
}

// ---------------------------------------------------------------------------
// Substitutions

export function canSubstitute(team: TeamState, free: boolean): boolean {
  return (
    team.stats.subsUsed < team.subLimit &&
    team.bench.length > 0 &&
    (free || team.stats.windowsUsed < team.windowLimit)
  );
}

export function substitute(
  s: MatchState,
  team: TeamState,
  out: PlayerState,
  incoming: PlayerState,
  reason: "injury" | "fatigue" | "tactical" | "redCardKeeper" | "manager",
): void {
  const slotIndex = out.slot as number;
  const minute = currentMinute(s);
  out.slot = null;
  out.offMinute = minute;
  out.stats.energyEnd = out.energy;
  incoming.slot = slotIndex;
  incoming.onMinute = minute;
  incoming.stats.position =
    team.plan.formation.slots[slotIndex]?.position ?? incoming.stats.position;
  team.slots[slotIndex] = incoming;
  team.bench = team.bench.filter((b) => b !== incoming);
  team.stats.subsUsed++;
  emit(
    s,
    {
      type: "sub",
      clock: s.clock,
      side: team.side,
      outPid: out.input.pid,
      inPid: incoming.input.pid,
      reason,
    },
    true,
  );
}

/** Best fresh substitute for a slot (keepers only for the GK slot). */
function bestFor(team: TeamState, slotIndex: number): PlayerState | null {
  const keeperSlot = team.plan.formation.slots[slotIndex]?.position === "GK";
  let best: PlayerState | null = null;
  let bestQ = -Infinity;
  for (const b of team.bench) {
    const isKeeper = rawPositionOvr(b.eff, "GK") > rawPositionOvr(b.eff, "CB") + 10;
    if (keeperSlot !== isKeeper) continue;
    const q = slotQuality(team, b, slotIndex);
    if (q > bestQ) {
      best = b;
      bestQ = q;
    }
  }
  return best;
}

/** The match score for decisions: aggregate in second legs. */
function goalDifference(s: MatchState, team: TeamState): number {
  const first = s.input.knockout?.firstLeg;
  const own = s.score[team.side] + (first ? (team.side === 0 ? first.home : first.away) : 0);
  const opp =
    s.score[team.side === 0 ? 1 : 0] + (first ? (team.side === 0 ? first.away : first.home) : 0);
  return own - opp;
}

/**
 * Called at every stoppage (between possessions). Makes forced changes (injuries, a
 * keeper sent off) for every team, and the AI's planned changes for teams it manages.
 * A stoppage where any substitution is made during play uses one window.
 */
export function manageStoppage(s: MatchState, free: boolean): void {
  for (const team of s.teams) {
    const due = team.input.aiInGame && (free || s.clock >= team.nextAiCheck);
    if (!team.needsAttention && !due) continue;
    const subsBefore = team.stats.subsUsed;
    let changed = false;

    // Injured players. AI-managed: replace if the rules allow, else he goes off and they
    // play with 10. Watched by the user: he decides; until then the player limps on.
    for (const p of onPitch(team)) {
      if (!p.injured) continue;
      if (!team.input.aiInGame) {
        if (p.energy > s.c.energy.floor) {
          emit(
            s,
            {
              type: "injury",
              clock: s.clock,
              side: team.side,
              pid: p.input.pid,
              days: p.stats.injuryDays,
              replaced: false,
            },
            true,
          );
          p.energy = s.c.energy.floor;
          changed = true;
        }
        continue;
      }
      const slotIndex = p.slot as number;
      const replacement = canSubstitute(team, free) ? bestFor(team, slotIndex) : null;
      emit(
        s,
        {
          type: "injury",
          clock: s.clock,
          side: team.side,
          pid: p.input.pid,
          days: p.stats.injuryDays,
          replaced: replacement !== null,
        },
        true,
      );
      if (replacement) substitute(s, team, p, replacement, "injury");
      else {
        team.slots[slotIndex] = null;
        p.slot = null;
        p.offMinute = currentMinute(s);
        p.stats.energyEnd = p.energy;
      }
      changed = true;
    }

    // Keeper sent off: bring on the reserve keeper for an outfielder, or put one in goal.
    const gkIndex = team.plan.formation.slots.findIndex((slot) => slot.position === "GK");
    if (team.slots[gkIndex] === null) {
      const outfield = onPitch(team);
      const reserve =
        team.input.aiInGame && canSubstitute(team, free) ? bestFor(team, gkIndex) : null;
      const sacrifice = outfield.reduce<PlayerState | null>(
        (worst, p) =>
          !worst ||
          slotQuality(team, p, p.slot as number) < slotQuality(team, worst, worst.slot as number)
            ? p
            : worst,
        null,
      );
      if (reserve && sacrifice) {
        const vacated = sacrifice.slot as number;
        substitute(s, team, sacrifice, reserve, "redCardKeeper");
        team.slots[vacated] = null;
        team.slots[gkIndex] = reserve;
        reserve.slot = gkIndex;
      } else if (outfield.length > 0) {
        const stand = outfield.reduce((best, p) =>
          rawPositionOvr(p.eff, "GK") > rawPositionOvr(best.eff, "GK") ? p : best,
        );
        team.slots[stand.slot as number] = null;
        team.slots[gkIndex] = stand;
        stand.slot = gkIndex;
      }
      changed = true;
    }
    team.needsAttention = false;

    if (due) {
      changed = aiDecisions(s, team, free) || changed;
      team.nextAiCheck = s.clock + s.c.ai.checkEvery;
    }
    if (team.stats.subsUsed > subsBefore && !free) team.stats.windowsUsed++;
    if (changed) refreshTeam(team, s.c);
  }
}

/** Tactical and fatigue decisions for AI-managed teams. Returns true if anything changed. */
function aiDecisions(s: MatchState, team: TeamState, free: boolean): boolean {
  const { c, rng } = s;
  const minute = currentMinute(s);
  let changed = false;

  // Chase a deficit or protect a lead with the sliders.
  const diff = goalDifference(s, team);
  const base = team.input.sliders;
  let mentality = base.mentality;
  let pressing = base.pressing;
  if (diff < 0 && minute >= c.ai.chaseFrom) {
    mentality = diff <= -2 || minute >= 80 ? 2 : 1;
    pressing = Math.max(pressing, 1);
  } else if (diff > 0 && minute >= c.ai.protectFrom) {
    mentality = diff === 1 && minute >= 85 ? -2 : -1;
  } else if (diff === 0 && minute >= c.ai.pushForWinFrom && team.edge >= c.ai.pushForWinEdge) {
    // Level late on, the stronger side goes for the winner.
    mentality = Math.max(mentality + 1, 1);
  }
  mentality = clamp(mentality, -2, 2);
  if (mentality !== team.sliders.mentality || pressing !== team.sliders.pressing) {
    team.sliders = { ...team.sliders, mentality, pressing };
    changed = true;
  }

  // Substitution windows: two planned ones, then late fresh legs; keep one window for
  // an injury until the late stage.
  if (!canSubstitute(team, free)) return changed;
  const windowsLeft = team.windowLimit - team.stats.windowsUsed;
  const subsLeft = team.subLimit - team.stats.subsUsed;
  let count = 0;
  if (s.period === "extraFirst" || s.period === "extraSecond") {
    count = free ? Math.min(subsLeft, 2) : 0;
  } else if (team.stats.windowsUsed === 0 && s.clock >= team.subPlan.first) {
    count = rng.bool(0.55) ? 2 : 1;
  } else if (team.stats.windowsUsed === 1 && s.clock >= team.subPlan.second && windowsLeft >= 2) {
    count = rng.bool(0.5) ? 2 : 1;
  } else if (s.clock >= team.subPlan.late && rng.bool(c.ai.lateUseChance)) {
    count = Math.min(subsLeft, 2);
    team.subPlan.late = Infinity; // decide once
  }
  count = Math.min(count, subsLeft);
  for (let i = 0; i < count; i++) {
    const swap = bestSwap(team, c.ai.freshLegsMargin);
    if (!swap) break;
    substitute(s, team, swap.out, swap.incoming, swap.out.energy < 0.6 ? "fatigue" : "tactical");
    changed = true;
  }
  return changed;
}

/** The substitution that most improves the team: tired or weaker players for fresh ones. */
function bestSwap(
  team: TeamState,
  margin: number,
): { out: PlayerState; incoming: PlayerState } | null {
  let best: { out: PlayerState; incoming: PlayerState; gain: number } | null = null;
  for (const p of onPitch(team)) {
    const slotIndex = p.slot as number;
    if (team.plan.formation.slots[slotIndex]?.position === "GK") continue;
    const incoming = bestFor(team, slotIndex);
    if (!incoming) continue;
    // Gain in slot quality, plus a premium for tired legs and for a booked player.
    const gain =
      slotQuality(team, incoming, slotIndex) -
      slotQuality(team, p, slotIndex) +
      8 * (1 - p.energy) +
      (p.booked ? 2 : 0);
    if (gain > -margin && (!best || gain > best.gain)) best = { out: p, incoming, gain };
  }
  return best;
}

/** Extra time: one more sub and one more window (SPEC §7.1). */
export function addExtraTimeAllowance(team: TeamState): void {
  team.subLimit += formationsConfig.extraTimeSubs;
  team.windowLimit += formationsConfig.extraTimeWindows;
}

/** A little energy back at half-time and before extra time. */
export function restAtBreak(s: MatchState, amount: number): void {
  for (const team of s.teams) {
    for (const p of onPitch(team)) {
      p.energy = Math.min(p.input.condition / 100, p.energy + amount);
    }
    refreshTeam(team, s.c);
  }
}
