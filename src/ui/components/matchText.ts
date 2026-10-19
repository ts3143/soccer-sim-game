/** Plain-text live feed lines for match events (Match lab; the polished feed is M6). */
import type { MatchEvent, Period } from "../../common/match";

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

const SHOT_WORDS = {
  saved: "saved",
  blocked: "blocked",
  off: "off target",
  goal: "scores",
} as const;

/** One feed line, or null for events the feed skips (fouls without cards, corners shown as-is). */
export function feedLine(event: MatchEvent, ctx: FeedContext, lastPeriod: Period): string | null {
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
      const assist = event.assistPid ? `, assisted by ${ctx.name(event.assistPid)}` : "";
      return `${minuteLabel(event.clock, lastPeriod)} GOAL! ${ctx.name(event.pid)} (${ctx.team(event.side)})${event.penalty ? " from the penalty spot" : assist}`;
    }
    case "shot":
      if (event.outcome === "goal") return null; // the goal line follows
      return `${minuteLabel(event.clock, lastPeriod)} ${event.shotType === "header" ? "Header" : event.shotType === "penalty" ? "Penalty" : "Shot"} by ${ctx.name(event.pid)} (${ctx.team(event.side)}), ${SHOT_WORDS[event.outcome]} · xG ${event.xg.toFixed(2)}`;
    case "card":
      return `${minuteLabel(event.clock, lastPeriod)} ${event.card === "yellow" ? "Yellow card" : event.card === "secondYellow" ? "Second yellow, sent off" : "Red card"}: ${ctx.name(event.pid)} (${ctx.team(event.side)})`;
    case "corner":
      return `${minuteLabel(event.clock, lastPeriod)} Corner to ${ctx.team(event.side)}`;
    case "penaltyAwarded":
      return `${minuteLabel(event.clock, lastPeriod)} Penalty to ${ctx.team(event.side)}!`;
    case "sub":
      return `${minuteLabel(event.clock, lastPeriod)} Substitution (${ctx.team(event.side)}): ${ctx.name(event.inPid)} on for ${ctx.name(event.outPid)}${event.reason === "injury" ? " (injury)" : ""}`;
    case "injury":
      return `${minuteLabel(event.clock, lastPeriod)} Injury: ${ctx.name(event.pid)} (${ctx.team(event.side)}), out for about ${event.days} days${event.replaced ? "" : ", and no substitution available"}`;
    case "shootoutKick":
      return `${ctx.team(event.side)}: ${ctx.name(event.pid)} ${event.scored ? "scores" : "misses"}`;
    case "foul":
      return null;
  }
}
