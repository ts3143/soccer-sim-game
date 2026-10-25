/** Plain-text feed lines for match events (the live commentary) and minute labels. */
import type { MatchEvent, Period } from "../../common/match";
import { BIG_CHANCE, cardLine, goalLine, penaltyLine, shotLine } from "./commentary";

type Shot = Extract<MatchEvent, { type: "shot" }>;
type Foul = Extract<MatchEvent, { type: "foul" }>;

/** Nominal end of each period in seconds, for "45+2"-style added time. */
const PERIOD_END: Record<Period, number> = {
  first: 45 * 60,
  second: 90 * 60,
  extraFirst: 105 * 60,
  extraSecond: 120 * 60,
  penalties: 120 * 60,
};
const PERIOD_START: Record<Period, number> = {
  first: 0,
  second: 45 * 60,
  extraFirst: 90 * 60,
  extraSecond: 105 * 60,
  penalties: 120 * 60,
};

function periodOf(clock: number): Period {
  if (clock < PERIOD_START.second) return "first";
  if (clock < PERIOD_START.extraFirst) return "second";
  if (clock < PERIOD_START.extraSecond) return "extraFirst";
  return "extraSecond";
}

/** "23'", "45+2'", "90+4'". `period` disambiguates first-half added time. */
export function minuteLabel(clock: number, period?: Period): string {
  const p = period ?? periodOf(clock);
  const end = PERIOD_END[p];
  if (clock >= end && p !== "penalties")
    return `${end / 60}+${Math.floor((clock - end) / 60) + 1}'`;
  return `${Math.floor(clock / 60) + 1}'`;
}

export interface FeedContext {
  name: (pid: number | null) => string;
  team: (side: 0 | 1) => string;
}

const PERIOD_NAMES: Record<Period, string> = {
  first: "First half",
  second: "Second half",
  extraFirst: "Extra time, first half",
  extraSecond: "Extra time, second half",
  penalties: "Penalty shoot-out",
};

/** The latest shot and foul in the feed, and the score so far: what lies behind a line. */
export interface FeedRecent {
  shot: Shot | null;
  foul: Foul | null;
  score: readonly [number, number] | null;
}
const NOTHING: FeedRecent = { shot: null, foul: null, score: null };

/**
 * One feed line (without its minute), or null for events the feed skips: fouls, and shots
 * that score (the goal line tells them).
 */
export function feedLine(
  event: MatchEvent,
  ctx: FeedContext,
  recent: FeedRecent = NOTHING,
): string | null {
  switch (event.type) {
    case "kickoff":
      return event.period === "penalties"
        ? "Penalty shoot-out"
        : `Kick-off: ${PERIOD_NAMES[event.period].toLowerCase()}`;
    case "periodEnd":
      return event.period === "first"
        ? "Half-time"
        : event.period === "second"
          ? "Full-time (90)"
          : `End of ${PERIOD_NAMES[event.period].toLowerCase()}`;
    case "goal": {
      const shot = recent.shot;
      const behind =
        shot && shot.clock === event.clock && shot.pid === event.pid && shot.outcome === "goal"
          ? shot
          : null;
      return goalLine(event, ctx.name, ctx.team(event.side), recent.score, behind);
    }
    case "shot":
      return event.outcome === "goal" ? null : shotLine(event, ctx.name, ctx.team(event.side));
    case "card": {
      const foul = recent.foul;
      const behind = foul && foul.clock === event.clock && foul.pid === event.pid ? foul : null;
      return cardLine(event, ctx.name, ctx.team(event.side), behind);
    }
    case "corner":
      return `Corner to ${ctx.team(event.side)}`;
    case "penaltyAwarded": {
      const foul = recent.foul;
      const behind = foul && foul.clock === event.clock && foul.side !== event.side ? foul : null;
      return penaltyLine(event.clock, ctx.team(event.side), ctx.name, behind);
    }
    case "sub":
      return `Substitution (${ctx.team(event.side)}): ${ctx.name(event.inPid)} on for ${ctx.name(event.outPid)}${event.reason === "injury" ? " (injury)" : ""}`;
    case "injury":
      return `Injury: ${ctx.name(event.pid)} (${ctx.team(event.side)}), out for about ${event.days} days${event.replaced ? "" : ", and no substitution available"}`;
    case "shootoutKick":
      return `${ctx.team(event.side)}: ${ctx.name(event.pid)} ${event.scored ? "scores" : "misses"}`;
    case "foul":
      return null;
  }
}

/** Key moments: what the "Key moments" feed keeps. */
export function isKeyMoment(event: MatchEvent): boolean {
  switch (event.type) {
    case "shot":
      return event.xg >= BIG_CHANCE;
    case "corner":
    case "foul":
      return false;
    default:
      return true;
  }
}
