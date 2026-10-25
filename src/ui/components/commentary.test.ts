import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../../common/match";
import { feedLine, isKeyMoment, type FeedContext, type FeedRecent } from "./matchText";

type Shot = Extract<MatchEvent, { type: "shot" }>;
type Foul = Extract<MatchEvent, { type: "foul" }>;

const NAMES: Record<number, string> = {
  1: "Kofi Mensah",
  2: "Emeka Okafor",
  3: "Jan Novak",
  4: "Leo Brandt",
  5: "Tom Price",
};
const ctx: FeedContext = {
  name: (pid) => (pid === null ? "?" : (NAMES[pid] ?? `#${pid}`)),
  team: (side) => (side === 0 ? "Harbour City" : "Valley Rovers"),
};
const none: FeedRecent = { shot: null, foul: null, score: null };

const cross: Shot = {
  type: "shot",
  clock: 1500,
  side: 0,
  pid: 2,
  assistPid: 1,
  shotType: "header",
  xg: 0.12,
  outcome: "saved",
  story: { flank: "L", stoppedBy: 3 },
};

describe("live commentary", () => {
  it("tells how a chance came about, who made it and who stopped it", () => {
    const line = feedLine(cross, ctx) as string;
    expect(line.startsWith("Kofi Mensah (Harbour City)")).toBe(true);
    expect(line).toContain("from the left");
    expect(line).toContain("Emeka Okafor");
    expect(line).toContain("Jan Novak");
    expect(line.endsWith("· xG 0.12")).toBe(true);
    // The team is named once, after the first of its players.
    expect(line.split("(Harbour City)")).toHaveLength(2);
  });

  it("names the set-piece taker, and opens with how the move began", () => {
    const corner = feedLine(
      { ...cross, assistPid: null, story: { setPiece: { kind: "corner", takerPid: 1 } } },
      ctx,
    ) as string;
    expect(corner).toMatch(/corner/);
    expect(corner).toContain("Kofi Mensah (Harbour City)");
    const rebound = feedLine(
      { ...cross, shotType: "central", story: { followUp: true, stoppedBy: 4 } },
      ctx,
    ) as string;
    expect(rebound).toMatch(
      /^(The ball breaks loose in the box|It comes straight back in|The ball drops)\. /,
    );
    expect(rebound).toContain("Leo Brandt");
  });

  it("tells a goal through the shot behind it, with the score", () => {
    const shot: Shot = { ...cross, outcome: "goal", story: { flank: "R" } };
    const goal: MatchEvent = {
      type: "goal",
      clock: 1500,
      side: 0,
      pid: 2,
      assistPid: 1,
      penalty: false,
    };
    expect(feedLine(shot, ctx)).toBeNull();
    const line = feedLine(goal, ctx, { shot, foul: null, score: [1, 0] }) as string;
    expect(line.startsWith("GOAL! Emeka Okafor (Harbour City), 1–0. ")).toBe(true);
    expect(line).toContain("Kofi Mensah");
    expect(line).toContain("from the right");
    // Without its shot (another moment), the plain line.
    expect(feedLine(goal, ctx, { shot: { ...shot, clock: 900 }, foul: null, score: null })).toBe(
      "GOAL! Emeka Okafor (Harbour City), assisted by Kofi Mensah",
    );
  });

  it("names the foul behind a card or a penalty", () => {
    const foul: Foul = { type: "foul", clock: 2000, side: 1, pid: 4, victimPid: 1 };
    const card: MatchEvent = { type: "card", clock: 2000, side: 1, pid: 4, card: "yellow" };
    const booked = feedLine(card, ctx, { ...none, foul }) as string;
    expect(booked).toContain("Leo Brandt (Valley Rovers)");
    expect(booked).toContain("Kofi Mensah");
    expect(feedLine(card, ctx)).toBe("Yellow card: Leo Brandt (Valley Rovers)");
    const penalty = feedLine({ type: "penaltyAwarded", clock: 2000, side: 0, pid: 2 }, ctx, {
      ...none,
      foul,
    }) as string;
    expect(penalty.startsWith("Penalty to Harbour City! ")).toBe(true);
    expect(penalty).toContain("Kofi Mensah");
    expect(penalty).toContain("Leo Brandt");
  });

  it("reads the same every time, and varies from chance to chance", () => {
    expect(feedLine(cross, ctx)).toBe(feedLine({ ...cross }, ctx));
    const lines = new Set(
      Array.from({ length: 40 }, (_, i) => feedLine({ ...cross, clock: 60 * i }, ctx)),
    );
    expect(lines.size).toBeGreaterThan(3);
  });

  it("still reads shots saved before the commentary knew their story", () => {
    const old: Shot = { ...cross, story: undefined };
    expect(feedLine(old, ctx)).toMatch(/but it's saved\. · xG 0\.12$/);
  });

  it("keeps goals, cards, subs, penalties and big chances as key moments", () => {
    expect(isKeyMoment(cross)).toBe(false);
    expect(isKeyMoment({ ...cross, xg: 0.45 })).toBe(true);
    expect(isKeyMoment({ type: "corner", clock: 1, side: 0 })).toBe(false);
    expect(isKeyMoment({ type: "card", clock: 1, side: 0, pid: 1, card: "yellow" })).toBe(true);
    expect(isKeyMoment({ type: "penaltyAwarded", clock: 1, side: 0, pid: 1 })).toBe(true);
    expect(isKeyMoment({ type: "kickoff", period: "second", clock: 2700 })).toBe(true);
  });
});
