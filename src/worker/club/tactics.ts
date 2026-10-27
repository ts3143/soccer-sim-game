/**
 * The user's line-up (SPEC §8.3, §9, §11 Tactics): who can be picked, the saved line-up
 * cleaned of players who have left, the AI's pick ("Auto"), re-slotting the XI into a new
 * formation, checking a setup, and the team ratings it gives at today's condition.
 *
 * The user's club always has a saved line-up (T, 2026-10-25): the AI's first pick when he
 * takes the club, then only what he saves. Injured and suspended players stay in it.
 */
import type { TacticsSetup } from "../../common/api";
import type { CompetitionsConfig } from "../../common/config/competitions";
import { formationById, formationsConfig } from "../../common/config/formations";
import { ageOn } from "../../common/dates";
import type { Club, Player } from "../../common/schema";
import { isSenior } from "../../common/status";
import { maximizeAssignment } from "../core/assignment";
import { slotOvr } from "../core/ovr";
import { teamProfile } from "../engine/aiTactics";
import { enginePlayer } from "../engine/prepare";
import type { TeamRatings } from "../engine/teamRatings";
import { currentCondition, pickMatchday } from "../season/squads";
import { effectiveDials } from "./standing";
import { GameError } from "../../common/errors";

/** Players the club can pick: its seniors (loanees in included) and academy players of 16+. */
export function selectable(
  players: readonly Player[],
  cid: number,
  date: string,
  config: CompetitionsConfig,
): Player[] {
  const minAge = config.rosterRules.academyMatchdayMinAge;
  return players.filter(
    (p) =>
      p.cid === cid &&
      (isSenior(p) || (p.status === "academy" && ageOn(p.birthDate, date) >= minAge)),
  );
}

/** The AI's pick for an ordinary match today: the same choice it makes for simulated matches. */
export function autoSetup(
  club: Club,
  players: readonly Player[],
  date: string,
  config: CompetitionsConfig,
): TacticsSetup {
  const squad = players.filter((p) => p.cid === club.cid);
  const pick = pickMatchday(club, squad, { date, importance: 1, nextImportance: 0 }, config);
  return {
    formation: pick.formation,
    sliders: { ...club.tactics.sliders },
    slots: [...pick.lineup],
    bench: [...pick.bench],
  };
}

/** A setup with only players who can still be picked, each once, and a bench of at most 9. */
export function cleanSetup(setup: TacticsSetup, pickable: ReadonlySet<number>): TacticsSetup {
  const seen = new Set<number>();
  const keep = (pid: number | null) => {
    if (pid === null || !pickable.has(pid) || seen.has(pid)) return null;
    seen.add(pid);
    return pid;
  };
  const slots = formationById(setup.formation).slots.map((_, i) => keep(setup.slots[i] ?? null));
  const bench = setup.bench
    .map(keep)
    .filter((pid): pid is number => pid !== null)
    .slice(0, formationsConfig.benchSize);
  return { formation: setup.formation, sliders: { ...setup.sliders }, slots, bench };
}

/** The club with the AI's pick for today saved as its line-up (a club the user takes). */
export function withAutoLineup(
  club: Club,
  players: readonly Player[],
  date: string,
  config: CompetitionsConfig,
): Club {
  const { formation, sliders, slots, bench } = autoSetup(club, players, date, config);
  return { ...club, tactics: { formation, sliders, lineup: { slots, bench } } };
}

/**
 * The club's line-up as saved, without players who have left (injured and suspended ones
 * stay), or the AI's pick when none is saved.
 */
export function currentSetup(
  club: Club,
  players: readonly Player[],
  date: string,
  config: CompetitionsConfig,
): TacticsSetup {
  const saved = club.tactics.lineup;
  if (!saved) return autoSetup(club, players, date, config);
  const pickable = new Set(selectable(players, club.cid, date, config).map((p) => p.pid));
  return cleanSetup(
    {
      formation: club.tactics.formation,
      sliders: club.tactics.sliders,
      slots: saved.slots,
      bench: saved.bench,
    },
    pickable,
  );
}

/** The same XI moved into `formation`'s slots, each where his slot OVRs add up best. */
export function reslot(
  setup: TacticsSetup,
  formation: string,
  byPid: ReadonlyMap<number, Player>,
): TacticsSetup {
  const slots = formationById(formation).slots;
  const xi = setup.slots
    .map((pid) => (pid === null ? undefined : byPid.get(pid)))
    .filter((p): p is Player => p !== undefined);
  // Rows = players, columns = slots, so a part-filled XI still gets distinct slots.
  const scores = xi.map((p) => slots.map((slot) => slotOvr(p, slot)));
  const slotOf = maximizeAssignment(scores);
  const next: (number | null)[] = slots.map(() => null);
  xi.forEach((p, i) => {
    next[slotOf[i] as number] = p.pid;
  });
  return { ...setup, formation, slots: next };
}

/** Throws a plain-language error if the setup breaks a rule (SPEC §7.1, §8.3). */
export function checkSetup(setup: TacticsSetup, pickable: ReadonlySet<number>): void {
  const formation = formationsConfig.formations.find((f) => f.id === setup.formation);
  if (!formation?.mvp)
    throw new GameError(`${setup.formation} isn't one of the formations you can pick`);
  if (setup.slots.length !== formation.slots.length) {
    throw new GameError(`A ${formation.id} line-up has ${formation.slots.length} slots`);
  }
  if (setup.bench.length > formationsConfig.benchSize) {
    throw new GameError(`The bench holds ${formationsConfig.benchSize} players`);
  }
  const named = [...setup.slots.filter((pid): pid is number => pid !== null), ...setup.bench];
  if (new Set(named).size !== named.length) throw new GameError("A player is picked twice");
  if (named.some((pid) => !pickable.has(pid))) {
    throw new GameError("Only players from your club who can play can be picked");
  }
  for (const value of Object.values(setup.sliders)) {
    if (!Number.isInteger(value) || value < -2 || value > 2) {
      throw new GameError("Sliders take whole steps from -2 to +2");
    }
  }
}

/** The seven team ratings the setup gives at today's condition (empty slots count as gaps). */
export function setupRatings(
  club: Club,
  setup: TacticsSetup,
  byPid: ReadonlyMap<number, Player>,
  date: string,
): TeamRatings {
  const medical = effectiveDials(club).medical;
  const named = [...setup.slots, ...setup.bench]
    .map((pid) => (pid === null ? undefined : byPid.get(pid)))
    .filter((p): p is Player => p !== undefined);
  const input = {
    cid: club.cid,
    formation: setup.formation,
    lineup: setup.slots.map((pid) => pid ?? -1),
    bench: setup.bench,
    players: named.map((p) => ({
      ...enginePlayer(p),
      condition: currentCondition(p, date, medical),
    })),
    sliders: setup.sliders,
    aiInGame: false,
    medicalDial: medical,
  };
  return teamProfile(input, undefined, setup.sliders).ratings;
}
