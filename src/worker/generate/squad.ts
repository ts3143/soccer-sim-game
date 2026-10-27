/**
 * Opening squad for one club (MILESTONES M1): 22–24 seniors built around the club's
 * default formation, tuned so the best XI's mean slot OVR hits the club's `strength`,
 * plus 4–6 academy players.
 */
import type { ClubDefinition } from "../../common/config/clubs";
import type { RosterRules } from "../../common/config/competitions";
import type { Formation } from "../../common/config/formations";
import { ratingsConfig, type Position, type Side } from "../../common/config/ratings";
import type { Player } from "../../common/schema";
import { bestXi, type XiPick } from "../core/lineup";
import type { Random } from "../core/random";
import { clubMix, sampleNationality } from "./identity";
import { generatePlayer, setRatings, type PlayerSpec } from "./player";
import { generateAcademyPlayer } from "./youth";

/** The best XI must land within this of `strength` (acceptance is ±1; aim tighter). */
export const STRENGTH_TOLERANCE = 0.45;

/** Where a backup may play instead of the slot he covers (adds realistic variety). */
const ADJACENT: Record<Position, Position[]> = {
  GK: [],
  CB: ["DM"],
  FB: ["WB"],
  WB: ["FB", "WM"],
  DM: ["CM", "CB"],
  CM: ["DM", "AM"],
  WM: ["W", "WB"],
  AM: ["CM", "W"],
  W: ["WM", "AM", "ST"],
  ST: ["W", "AM"],
};
const ADJACENT_BACKUP_CHANCE = 0.15;

/** Opening academy size and ages (weights): the settled shape of the youth intake. */
export const OPENING_ACADEMY = {
  min: 9,
  max: 12,
  ages: [
    [15, 23],
    [16, 43],
    [17, 34],
  ] as [number, number][],
};

type Role = "starter" | "gk2" | "gk3" | "backup";
interface Need {
  position: Position;
  side: Side;
  role: Role;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function squadNeeds(rng: Random, formation: Formation, seniors: number): Need[] {
  const starters: Need[] = formation.slots.map((slot) => ({ ...slot, role: "starter" }));
  const outfield = formation.slots.filter((slot) => slot.position !== "GK");
  const backups: Need[] = outfield.map((slot) => ({ ...slot, role: "backup" }));
  const wanted = seniors - formation.slots.length - 2;
  while (backups.length > wanted) backups.splice(rng.int(0, backups.length - 1), 1);
  while (backups.length < wanted) backups.push({ ...rng.choice(outfield), role: "backup" });
  for (const backup of backups) {
    const options = ADJACENT[backup.position];
    if (options.length > 0 && rng.bool(ADJACENT_BACKUP_CHANCE)) {
      backup.position = rng.choice(options);
      if (!ratingsConfig.sidedPositions.includes(backup.position)) backup.side = "C";
      else if (backup.side === "C") backup.side = rng.choice(["L", "R"] as const);
    }
  }
  return [
    ...starters,
    { position: "GK", side: "C", role: "gk2" },
    { position: "GK", side: "C", role: "gk3" },
    ...backups,
  ];
}

/** Age and target quality for a squad role at a club of `strength` S. */
function ageAndQuality(rng: Random, need: Need, S: number): { age: number; quality: number } {
  switch (need.role) {
    case "starter": {
      const age =
        need.position === "GK"
          ? clamp(Math.round(rng.normal(28.5, 3.5)), 21, 37)
          : clamp(Math.round(rng.normal(27, 3.3)), 19, 35);
      return { age, quality: clamp(S + rng.normal(0, 3.2), S - 9, S + 10) };
    }
    case "gk2":
      return {
        age: clamp(Math.round(rng.normal(27, 5)), 19, 36),
        quality: S - 6 + rng.normal(0, 3),
      };
    case "gk3":
      return {
        age: rng.bool(0.5) ? rng.int(18, 20) : rng.int(30, 36),
        quality: S - 14 + rng.normal(0, 4),
      };
    case "backup": {
      const young = rng.bool(0.45);
      const age = young ? rng.int(18, 22) : clamp(Math.round(rng.normal(27, 4)), 21, 35);
      return { age, quality: S - 5 - (young ? 4 : 0) + rng.normal(0, 3) };
    }
  }
}

/** Shifts every rating except height by `delta` points (used to tune the XI). */
function shiftRatings(player: Player, delta: number): void {
  const current = player.ratingsHistory[player.ratingsHistory.length - 1]?.ratings ?? [];
  setRatings(
    player,
    current.map((value, i) => (i === 0 ? value : clamp(value + delta, 0, 100))),
  );
}

/** Nudges XI players a point at a time until the best XI is within tolerance of S. */
function tuneToStrength(rng: Random, seniors: Player[], formation: Formation, S: number): XiPick {
  let xi = bestXi(seniors, formation);
  for (let iteration = 0; iteration < 40; iteration++) {
    const diff = S - xi.meanOvr;
    if (Math.abs(diff) <= STRENGTH_TOLERANCE) return xi;
    const count = clamp(
      Math.round(Math.abs(diff) * formation.slots.length),
      1,
      formation.slots.length,
    );
    const slots = rng.shuffle(xi.playerIndexBySlot).slice(0, count);
    for (const index of slots) shiftRatings(seniors[index] as Player, Math.sign(diff));
    xi = bestXi(seniors, formation);
  }
  throw new Error(`Could not tune squad to strength ${S} (got ${xi.meanOvr.toFixed(2)})`);
}

const STARTER_NUMBERS: Record<Position, Record<Side, number[]>> = {
  GK: { L: [1], C: [1], R: [1] },
  CB: { L: [5, 6], C: [4, 5, 6], R: [4, 6] },
  FB: { L: [3], C: [3], R: [2] },
  WB: { L: [3], C: [3], R: [2] },
  DM: { L: [6], C: [6, 4], R: [6] },
  CM: { L: [8], C: [8, 4, 14], R: [8] },
  WM: { L: [11], C: [11], R: [7] },
  AM: { L: [10], C: [10], R: [10] },
  W: { L: [11], C: [7], R: [7] },
  ST: { L: [9], C: [9, 10, 19], R: [9] },
};

function assignShirtNumbers(
  starters: Player[],
  needs: Need[],
  others: Player[],
  academy: Player[],
) {
  const taken = new Set<number>();
  const take = (preferred: number[], fallbackFrom: number) => {
    const choice = preferred.find((n) => !taken.has(n)) ?? next(fallbackFrom);
    taken.add(choice);
    return choice;
  };
  const next = (from: number) => {
    let n = from;
    while (taken.has(n)) n++;
    return n;
  };
  starters.forEach((player, i) => {
    const need = needs[i] as Need;
    player.shirtNumber = take(STARTER_NUMBERS[need.position][need.side], 12);
  });
  for (const player of others)
    player.shirtNumber = take(player.position === "GK" ? [13, 31] : [], 12);
  for (const player of academy) player.shirtNumber = take([], 36);
}

export interface SquadOptions {
  club: ClubDefinition;
  cid: number;
  formation: Formation;
  season: number;
  seasonStart: string;
  nextPid: () => number;
  rules: RosterRules;
  /** The world's nationality mix (identity.ts worldMix), for second nationalities. */
  worldMix: Record<string, number>;
}

export interface GeneratedSquad {
  seniors: Player[];
  academy: Player[];
  xi: XiPick;
}

export function generateSquad(rng: Random, options: SquadOptions): GeneratedSquad {
  const { club, cid, formation, season, seasonStart, rules, worldMix } = options;
  const seniorCount = rng.int(rules.startingSeniors.min, rules.startingSeniors.max);
  const mix = clubMix(club.league, club.country);

  const needs = squadNeeds(rng, formation, seniorCount);
  const seniors = needs.map((need) => {
    const { age, quality } = ageAndQuality(rng, need, club.strength);
    const spec: PlayerSpec = {
      position: need.position,
      side: need.side,
      quality: clamp(quality, 25, 95),
      age,
      nationality: sampleNationality(rng, mix),
      secondMix: worldMix,
      status: "club",
      cid,
    };
    return generatePlayer(rng, spec, options.nextPid(), season, seasonStart);
  });

  const xi = tuneToStrength(rng, seniors, formation, club.strength);

  // Opening academies in the shape the yearly intake settles at (T, 2026-10-15): 9–12
  // players aged 15–17 per club (18-year-olds are promoted or released each summer).
  const academyCount = rng.int(OPENING_ACADEMY.min, OPENING_ACADEMY.max);
  const academy = Array.from({ length: academyCount }, () => {
    const age = rng.weighted(OPENING_ACADEMY.ages, ([, w]) => w)[0];
    return generateAcademyPlayer(
      rng,
      {
        cid,
        country: club.country,
        leagueId: club.league,
        reputation: club.reputation,
        youthDial: 50,
        maxQuality: club.strength - 3,
      },
      age,
      options.nextPid(),
      season,
      seasonStart,
      worldMix,
    );
  });

  const starters = xi.playerIndexBySlot.map((index) => seniors[index] as Player);
  const others = seniors.filter((player) => !starters.includes(player));
  assignShirtNumbers(
    starters,
    formation.slots.map((slot) => ({ ...slot, role: "starter" })),
    others,
    academy,
  );

  return { seniors, academy, xi };
}
