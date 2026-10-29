/**
 * Free agency without transfer windows (SPEC §17.6; the Super League's): open from 1 July
 * to the roster deadline. AI clubs sign free agents on market days, up to a squad target
 * in the summer and after that only to fill a gap. The squad limit counts from the first
 * league match (SPEC §17.4): AI clubs over it release players before that match.
 */
import type { CompetitionsConfig } from "../../common/config/competitions";
import type { Fixture, Player } from "../../common/schema";
import { addDays } from "../../common/dates";
import { seasonDate } from "../schedule/calendar";
import {
  emptyLog,
  freeAgencyTopUp,
  type LoopWorld,
  releaseToFreeAgency,
  type TurnoverLog,
} from "./offseason";

const leagueFixtures = (config: CompetitionsConfig, fixtures: readonly Fixture[]) => {
  const leagues = new Set(config.leagues.map((l) => l.id));
  return fixtures.filter((f) => leagues.has(f.competition));
};

/**
 * The roster deadline of the season of `fixtures`: the day of the league round at the
 * configured share of the regular season (the latest such day across leagues). Null
 * without free agency config or league fixtures.
 */
export function rosterDeadline(
  config: CompetitionsConfig,
  fixtures: readonly Fixture[],
): string | null {
  const share = config.freeAgency?.deadlineAfterRoundShare;
  if (share === undefined) return null;
  let deadline: string | null = null;
  for (const league of config.leagues) {
    const own = fixtures.filter((f) => f.competition === league.id);
    const rounds = Math.max(0, ...own.map((f) => Number(f.round) || 0));
    const round = String(Math.ceil(share * rounds));
    for (const f of own) {
      if (f.round === round && (deadline === null || f.date > deadline)) deadline = f.date;
    }
  }
  return deadline;
}

/** The day of the season's first league match (null without league fixtures). */
export function firstLeagueDay(
  config: CompetitionsConfig,
  fixtures: readonly Fixture[],
): string | null {
  let first: string | null = null;
  for (const f of leagueFixtures(config, fixtures))
    if (first === null || f.date < first) first = f.date;
  return first;
}

/** Free agency is open on `date` of `season`: from 1 July to the deadline, both included. */
export const freeAgencyOpen = (season: number, date: string, deadline: string | null): boolean =>
  date >= `${season}-07-01` && (deadline === null || date <= deadline);

/** `season`'s AI market days for free agents: `busy` ones until `busyUntil`, then gap ones. */
export function freeAgencyDays(
  season: number,
  config: CompetitionsConfig,
  deadline: string | null,
): { date: string; busy: boolean }[] {
  const fa = config.freeAgency;
  if (!fa) return [];
  const busyUntil = seasonDate(season, fa.busyUntil);
  const end = deadline ?? busyUntil;
  const days: { date: string; busy: boolean }[] = [];
  for (let d = addDays(`${season}-07-01`, fa.everyDays); d <= end; d = addDays(d, fa.everyDays)) {
    days.push({ date: d, busy: d <= busyUntil });
  }
  return days;
}

/** A market day for free agents: AI clubs short of the day's target sign some. */
export function freeAgencyDay(
  world: LoopWorld,
  season: number,
  day: { date: string; busy: boolean },
): TurnoverLog {
  const fa = world.config.competitions.freeAgency;
  if (!fa) return emptyLog();
  const target = day.busy ? fa.squadTarget : fa.gapBelow;
  return freeAgencyTopUp(world, season, day.date, target, fa.perDay);
}

/**
 * Before a league match (SPEC §17.4): every AI club over the squad limit releases its
 * least valued players (by OVR and POT, as the draft weighs them) down to it, keeping two
 * keepers. Released players are paid until their contracts end, as the user's are.
 */
export function trimSquads(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  const max = world.config.competitions.rosterRules.maxSenior;
  const w = world.config.competitions.draft?.aiPick.potWeight ?? 0;
  const value = (p: { ovr: number; pot: number }) => (1 - w) * p.ovr + w * p.pot;
  const squads = new Map<number, Player[]>();
  for (const p of world.players) {
    if (p.status !== "club" || p.cid === null) continue;
    const squad = squads.get(p.cid);
    if (squad) squad.push(p);
    else squads.set(p.cid, [p]);
  }
  for (const club of world.clubs) {
    const squad = squads.get(club.cid) ?? [];
    if (club.cid === world.userCid || squad.length <= max) continue;
    let keepers = squad.filter((p) => p.position === "GK").length;
    let over = squad.length - max;
    for (const p of squad.sort((a, b) => value(a) - value(b) || a.pid - b.pid)) {
      if (over === 0) break;
      if (p.position === "GK") {
        if (keepers <= 2) continue;
        keepers--;
      }
      log.transactions.push(releaseToFreeAgency(club, p, date, season));
      log.changed.add(p.pid);
      over--;
    }
  }
  return log;
}
