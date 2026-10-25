/**
 * The live commentary's words (T, 2026-10-25): how each chance came about and who made
 * it, with several phrasings per event. The phrasing is picked by a hash of the event, not
 * the game's random numbers, so a reloaded match reads the same and nothing in the game
 * changes.
 */
import type { MatchEvent, ShotStory } from "../../common/match";

type Shot = Extract<MatchEvent, { type: "shot" }>;
type Goal = Extract<MatchEvent, { type: "goal" }>;
type Card = Extract<MatchEvent, { type: "card" }>;
type Foul = Extract<MatchEvent, { type: "foul" }>;
type Name = (pid: number | null) => string;

/** A chance this big (xG) is a key moment, and a miss is lamented. */
export const BIG_CHANCE = 0.3;

/** One of the options, the same every time for the same event. */
function variant(options: readonly string[], ...seed: (string | number)[]): string {
  let h = 0x811c9dc5;
  for (const ch of seed.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  // Mix the bits, so that nearby clocks don't share a phrasing.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return options[(h >>> 0) % options.length] as string;
}

const FLANK: Record<NonNullable<ShotStory["flank"]>, string> = { L: "the left", R: "the right" };

/** A short sentence before an open-play chance: how the move began. */
function opener(e: Shot): string | null {
  const story = e.story ?? {};
  const v = (options: string[]) => variant(options, "opener", e.clock, e.pid);
  if (story.followUp)
    return v([
      "The ball breaks loose in the box.",
      "It comes straight back in.",
      "The ball drops.",
    ]);
  if (story.origin === "wonHigh")
    return v(["Won back high up the pitch.", "The press pays off.", "A loose pass is pounced on."]);
  if (story.origin === "longBall")
    return v(["A long ball forward.", "Straight up to the front line.", "One ball over the top."]);
  return null;
}

/** The chance itself, ending with the shooter on the ball. */
function buildUp(e: Shot, name: Name): string {
  const s = name(e.pid);
  const a = e.assistPid === null ? null : name(e.assistPid);
  const story = e.story ?? {};
  const v = (options: string[]) => variant(options, "build", e.clock, e.pid);
  switch (e.shotType) {
    case "penalty":
      return v([`${s} steps up to take it`, `${s} places the ball on the spot`]);
    case "freeKick":
      return v([
        `${s} goes for goal from the free kick`,
        `${s} steps up to the free kick`,
        `${s} tries to bend the free kick over the wall`,
      ]);
    case "header": {
      const setPiece = story.setPiece;
      if (setPiece) {
        const what = setPiece.kind === "corner" ? "corner" : "free kick";
        const t =
          setPiece.takerPid === null || setPiece.takerPid === e.pid
            ? null
            : name(setPiece.takerPid);
        return t
          ? v([
              `${t} delivers the ${what}, and ${s} meets it`,
              `${t} swings in the ${what} and ${s} rises highest`,
              `${s} attacks ${t}'s ${what}`,
            ])
          : v([`From the ${what}, ${s} gets his head to it`, `${s} rises to meet the ${what}`]);
      }
      const flank = story.flank ? ` from ${FLANK[story.flank]}` : "";
      return a
        ? v([
            `${a} whips in a cross${flank} and ${s} gets his head to it`,
            `${a} swings it in${flank}, and ${s} rises to meet it`,
            `${a} delivers${flank}, and ${s} goes up for the header`,
          ])
        : v([
            `The ball is crossed in${flank} and ${s} gets his head to it`,
            `${s} meets a cross${flank} with his head`,
          ]);
    }
    case "dribble": {
      const wing = story.flank ? ` down ${FLANK[story.flank]}` : "";
      return a
        ? v([
            `${a} feeds ${s}, who skips past his man${wing}`,
            `${a} plays it to ${s}, who beats his marker${wing}`,
          ])
        : v([
            `${s} beats his man${wing} and cuts inside`,
            `${s} dances past a challenge${wing}`,
            `${s} drives at the defence${wing}`,
          ]);
    }
    case "longShot":
      return a
        ? v([
            `${a} lays it off for ${s}, who lets fly from distance`,
            `${a} rolls it back to ${s}, who shoots from range`,
          ])
        : v([
            `${s} tries his luck from 25 yards`,
            `${s} shoots from range`,
            `${s} lets fly from distance`,
          ]);
    case "central":
      return a
        ? v([
            `${a} threads a pass through to ${s}`,
            `${a} slips ${s} in behind the defence`,
            `${a} squares it for ${s}`,
            `${a} picks out ${s} in the box`,
          ])
        : v([
            `${s} finds a yard of space in the box`,
            `${s} reacts first in a crowded box`,
            `${s} turns his marker in the box`,
          ]);
  }
}

/** How a shot that isn't a goal ends. */
function miss(e: Shot, name: Name): string {
  const v = (options: string[]) => variant(options, "miss", e.clock, e.pid);
  const by = e.story?.stoppedBy;
  const k = by === undefined ? null : name(by);
  const big = e.xg >= BIG_CHANCE;
  switch (e.outcome) {
    case "saved":
      if (!k) return "but it's saved";
      if (e.shotType === "penalty") return v([`but ${k} saves it`, `but ${k} guesses right`]);
      return big
        ? v([`but ${k} makes a fine save`, `but ${k} pulls off a great save`])
        : v([`but ${k} saves`, `but ${k} gets down to save`, `but it's straight at ${k}`]);
    case "blocked":
      return k
        ? v([
            `but ${k} blocks it`,
            `but ${k} throws himself in the way`,
            `but ${k} gets a block in`,
          ])
        : "but it's blocked";
    default:
      if (e.shotType === "penalty") return v(["but he puts it wide", "but he blazes it over"]);
      if (e.shotType === "header")
        return v(["but it goes over", "but he heads wide", "but it loops over the bar"]);
      return v([
        "but it's wide",
        "but it flies over the bar",
        "but it drifts past the post",
        "but he drags it wide",
      ]);
  }
}

/** How a goal goes in: a sentence of its own, after the build-up. */
function scores(e: Shot): string {
  const v = (options: string[]) => variant(options, "goal", e.clock, e.pid);
  switch (e.shotType) {
    case "header":
      return v(["It's in!", "He heads it home!", "It flies into the net!"]);
    case "longShot":
      return v(["It flies into the top corner!", "What a strike!", "It's in!"]);
    case "freeKick":
      return v(["It curls in!", "It's in!", "The keeper can only watch it go in!"]);
    case "penalty":
      return v(["He sends the keeper the wrong way!", "He scores!", "He smashes it in!"]);
    default:
      return v(["He slots it home!", "He finishes coolly!", "He fires it in!", "He buries it!"]);
  }
}

/** Puts "(Team)" after the first of the attacking players named in the sentence. */
function withTeam(text: string, names: (string | null)[], team: string): string {
  let at = -1;
  let found = "";
  for (const n of names) {
    if (!n) continue;
    const i = text.indexOf(n);
    if (i >= 0 && (at < 0 || i < at)) [at, found] = [i, n];
  }
  if (at < 0) return text;
  const end = at + found.length;
  return `${text.slice(0, end)} (${team})${text.slice(end)}`;
}

function attackers(e: Shot, name: Name): (string | null)[] {
  const taker = e.story?.setPiece?.takerPid;
  return [
    name(e.pid),
    e.assistPid === null ? null : name(e.assistPid),
    taker === undefined || taker === null ? null : name(taker),
  ];
}

function sentence(e: Shot, name: Name, team: string, end: string): string {
  const first = opener(e);
  const body = withTeam(`${buildUp(e, name)}, ${end}`, attackers(e, name), team);
  return `${first ? `${first} ` : ""}${body}`;
}

/** A shot that isn't a goal. */
export function shotLine(e: Shot, name: Name, team: string): string {
  const lament =
    e.xg >= BIG_CHANCE && e.shotType !== "penalty"
      ? ` ${variant(["What a chance!", "A big chance gone.", "So close!"], "lament", e.clock, e.pid)}`
      : "";
  return `${sentence(e, name, team, miss(e, name))}.${lament} · xG ${e.xg.toFixed(2)}`;
}

/** A goal, told through the shot behind it; the plain line when the shot isn't known. */
export function goalLine(
  e: Goal,
  name: Name,
  team: string,
  score: readonly [number, number] | null,
  shot: Shot | null,
): string {
  const head = `GOAL! ${name(e.pid)} (${team})`;
  const tally = score ? `, ${score[0]}–${score[1]}` : "";
  if (!shot) {
    const assist = e.assistPid ? `, assisted by ${name(e.assistPid)}` : "";
    return `${head}${e.penalty ? " from the penalty spot" : assist}${tally}`;
  }
  const first = opener(shot);
  return `${head}${tally}. ${first ? `${first} ` : ""}${buildUp(shot, name)}. ${scores(shot)}`;
}

/** A card, with the foul behind it when it's known. */
export function cardLine(e: Card, name: Name, team: string, foul: Foul | null): string {
  const p = `${name(e.pid)} (${team})`;
  const victim = foul?.victimPid ?? null;
  const v = (options: string[]) => variant(options, "card", e.clock, e.pid);
  if (victim === null) {
    return e.card === "yellow"
      ? `Yellow card: ${p}`
      : e.card === "secondYellow"
        ? `Second yellow, sent off: ${p}`
        : `Red card: ${p}`;
  }
  const on = name(victim);
  switch (e.card) {
    case "yellow":
      return v([
        `Yellow card: ${p}, for a foul on ${on}`,
        `${p} is booked for a foul on ${on}`,
        `${p} goes into the book for bringing down ${on}`,
      ]);
    case "secondYellow":
      return v([
        `Second yellow, sent off: ${p}, for a foul on ${on}`,
        `${p} brings down ${on} and sees a second yellow. He's off!`,
      ]);
    case "red":
      return v([
        `Straight red! ${p} is sent off for a foul on ${on}`,
        `Red card: ${p}, for a reckless challenge on ${on}`,
      ]);
  }
}

/** A penalty given, with the foul behind it when it's known. */
export function penaltyLine(clock: number, team: string, name: Name, foul: Foul | null): string {
  if (!foul || foul.victimPid === null) return `Penalty to ${team}!`;
  const [victim, fouler] = [name(foul.victimPid), name(foul.pid)];
  return `Penalty to ${team}! ${variant(
    [
      `${victim} is brought down by ${fouler}.`,
      `${fouler} clips ${victim} in the box.`,
      `${fouler} bundles ${victim} over.`,
    ],
    "penalty",
    clock,
    foul.pid,
  )}`;
}
