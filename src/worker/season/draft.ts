/**
 * The draft (SPEC §17.5), its AI core: each June a class of prospects, the pick order from
 * the season's tables (the lottery first), and each slot's pick owner picking by value and
 * need, two rounds in the same order. Rookies sign rookie contracts; prospects nobody picks
 * become free agents. Picks are owned assets, made ahead, numbered by the lottery and used
 * up at the draft. In a save the draft runs pick by pick: the user makes his own picks, or
 * the AI makes them for him.
 */
import type { DraftConfig } from "../../common/config/competitions";
import type { WorldConfig } from "../../common/config/worlds";
import { ratingsConfig, type Side } from "../../common/config/ratings";
import type { Club, DraftPick, Player } from "../../common/schema";
import { Random } from "../core/random";
import { roundWage } from "../generate/contracts";
import { sampleNationality, worldMix } from "../generate/identity";
import { capCeiling, generatePlayer } from "../generate/player";
import { ACADEMY_POSITIONS } from "../generate/youth";
import {
  AREA,
  emptyLog,
  freeShirtNumber,
  fullName,
  type LoopWorld,
  type TurnoverLog,
  updatePot,
} from "./offseason";
import { seasonDate } from "../schedule/calendar";
import type { SeasonOutcome } from "./season";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * The lottery: `picks` draws, each weighted by the odds of the clubs not yet drawn; the
 * rest follow in odds order. `odds` are best first; returns their indices in pick order.
 */
export function drawLottery(odds: readonly number[], picks: number, rng: Random): number[] {
  const left = odds.map((_, i) => i);
  const order: number[] = [];
  for (let k = 0; k < picks && left.length > 0; k++) {
    const i = rng.weighted(left, (j) => odds[j] ?? 0);
    order.push(i);
    left.splice(left.indexOf(i), 1);
  }
  return [...order, ...left];
}

/**
 * One round's pick order (every round alike), first pick first: the lottery pool (drawn
 * with `rng`, or in odds order without one); the other clubs in reverse combined
 * standings (the lowest tier first, each from the bottom of its table); the promoted clubs
 * last, by the same rule.
 */
export function draftOrder(
  draft: DraftConfig,
  outcome: SeasonOutcome,
  tiers: ReadonlyMap<string, number>,
  rng: Random | null = null,
): number[] {
  const slots = draft.lotteryPool.map((slot) => {
    const cid = outcome.tables[slot.league]?.[slot.position - 1]?.cid;
    if (cid === undefined) throw new Error(`No ${slot.league} ${slot.position} for the draft`);
    return cid;
  });
  const drawn = rng
    ? drawLottery(
        draft.lotteryPool.map((s) => s.odds),
        draft.lotteryPicks,
        rng,
      )
    : slots.map((_, i) => i);
  const pool = drawn.map((i) => slots[i] as number);
  const inPool = new Set(pool);
  const promoted = new Set(outcome.moves.filter((m) => m.reason !== "relegated").map((m) => m.cid));
  const rows = Object.entries(outcome.tables).flatMap(([league, table]) =>
    table.map((r) => ({ cid: r.cid, tier: tiers.get(league) ?? 0, position: r.position })),
  );
  const reverse = (a: (typeof rows)[0], b: (typeof rows)[0]) =>
    b.tier - a.tier || b.position - a.position;
  const others = rows.filter((r) => !inPool.has(r.cid)).sort(reverse);
  return [
    ...pool,
    ...others.filter((r) => !promoted.has(r.cid)).map((r) => r.cid),
    ...others.filter((r) => promoted.has(r.cid)).map((r) => r.cid),
  ];
}

/** A rookie's yearly wage at overall pick `pick`, from the config's points (interpolated). */
export function rookieWage(draft: DraftConfig, pick: number): number {
  const points = draft.rookieContract.wageByPick;
  const first = points[0] as [number, number];
  if (pick <= first[0]) return roundWage(first[1]);
  for (let i = 1; i < points.length; i++) {
    const [p0, w0] = points[i - 1] as [number, number];
    const [p1, w1] = points[i] as [number, number];
    if (pick <= p1) return roundWage(w0 + ((w1 - w0) * (pick - p0)) / (p1 - p0));
  }
  return roundWage((points.at(-1) as [number, number])[1]);
}

/**
 * The picks missing for the drafts of seasons `from` to `to`: every club's own, each round
 * (a club's traded picks stay with their owner). Returns the new ones.
 */
export function missingPicks(
  draft: DraftConfig,
  clubs: readonly Pick<Club, "cid">[],
  picks: readonly DraftPick[],
  from: number,
  to: number,
): DraftPick[] {
  const key = (s: number, round: number, cid: number) => `${s}/${round}/${cid}`;
  const have = new Set(picks.map((p) => key(p.season, p.round, p.originalCid)));
  const added: DraftPick[] = [];
  for (let s = from; s <= to; s++) {
    for (let round = 1; round <= draft.rounds; round++) {
      for (const { cid } of clubs) {
        if (!have.has(key(s, round, cid))) added.push({ season: s, round, originalCid: cid, cid });
      }
    }
  }
  return added;
}

/** What generating a class needs: the world, the save's seed and new player IDs. */
export interface ClassSetup {
  config: WorldConfig;
  seed: string;
  nextPid: () => number;
}

/**
 * Each club's chance at pick 1 (%) if the season ended with these tables (the Standings'
 * lottery column, SPEC §17.5): the pool's places and their odds; no entry outside the pool.
 */
export function lotteryOddsNow(
  draft: DraftConfig,
  tables: Readonly<Record<string, readonly number[]>>,
): Map<number, number> {
  const odds = new Map<number, number>();
  for (const slot of draft.lotteryPool) {
    const cid = tables[slot.league]?.[slot.position - 1];
    if (cid !== undefined) odds.set(cid, slot.odds);
  }
  return odds;
}

/**
 * The class of `season`'s draft (held the next June), generated on `date` (1 July of a
 * season up to `classesAhead` before): aged per the config at the draft, prospects until
 * then (SPEC §17.5). Generated weaker by the growth expected in the summers to come.
 */
export function draftClass(setup: ClassSetup, season: number, date: string): Player[] {
  const draft = setup.config.competitions.draft;
  if (!draft) return [];
  const draftDate = seasonDate(season, setup.config.competitions.keyDates.draft ?? "06-15");
  const rng = Random.fromSeed(`${setup.seed}/draft/${season}`);
  const q = draft.prospectQuality;
  const mix = worldMix(setup.config);
  const summersLeft = season - Number(date.slice(0, 4));
  return Array.from({ length: draft.classSize }, () => {
    const position = rng.weighted(ACADEMY_POSITIONS, ([, w]) => w)[0];
    const side: Side = ratingsConfig.sidedPositions.includes(position)
      ? rng.choice(["L", "R"] as const)
      : "C";
    const age = rng.int(draft.ages.min, draft.ages.max);
    const talent = rng.normal(0, 1);
    const quality =
      clamp(q.mean + q.perYear * (age - draft.ages.min) + talent * q.sd, q.min, q.max) -
      q.growthPerYear * summersLeft;
    const player = generatePlayer(
      rng,
      {
        position,
        side,
        quality,
        age,
        nationality: sampleNationality(rng, mix),
        secondMix: mix,
        status: "prospect",
        cid: null,
      },
      setup.nextPid(),
      season,
      draftDate,
    );
    // Born for his age at the draft; his ratings are today's.
    const first = player.ratingsHistory[0];
    if (first) first.date = date;
    player.draftSeason = season;
    player.hidden.ceiling = capCeiling(
      player.hidden.ceiling + talent * q.talentHeadroom,
      player.ovr,
    );
    updatePot(player, date, undefined, setup.seed);
    return player;
  });
}

/**
 * Sets the order of `season`'s draft (the season just played) on `date`, the lottery's
 * day: the lottery is drawn and each of the season's picks gets its overall number, every
 * round in `draftOrder` (a club missing its pick gets it). A world without a class yet
 * (none so far) gets one here.
 */
export function setDraftOrder(
  world: LoopWorld,
  outcome: SeasonOutcome,
  season: number,
  date: string,
): TurnoverLog {
  const log = emptyLog();
  const draft = world.config.competitions.draft;
  if (!draft) return log;
  if (!world.players.some((p) => p.status === "prospect" && p.draftSeason === season)) {
    const prospects = draftClass(world, season, date);
    world.players.push(...prospects);
    log.added.push(...prospects);
  }
  const tiers = new Map(world.config.competitions.leagues.map((l) => [l.id, l.tier]));
  const lottery = Random.fromSeed(`${world.seed}/lottery/${season}`);
  const order = draftOrder(draft, outcome, tiers, lottery);
  const picks = world.draftPicks ?? [];
  world.draftPicks = [...picks, ...missingPicks(draft, world.clubs, picks, season, season)];
  const slots = new Map(
    world.draftPicks
      .filter((p) => p.season === season)
      .map((p) => [`${p.round}/${p.originalCid}`, p]),
  );
  let pick = 0;
  for (let round = 1; round <= draft.rounds; round++) {
    for (const cid of order) {
      pick++;
      const slot = slots.get(`${round}/${cid}`);
      if (slot) slot.pick = pick;
    }
  }
  return log;
}

/** The next pick of `season`'s draft, or null when the draft is over (or not yet ordered). */
export function nextPick(picks: readonly DraftPick[], season: number): DraftPick | null {
  let next: DraftPick | null = null;
  for (const p of picks) {
    if (p.season === season && p.pick !== undefined && (next?.pick ?? Infinity) > p.pick) next = p;
  }
  return next;
}

/** The prospects still there to pick in `season`'s draft. */
export const availableProspects = (players: readonly Player[], season: number): Player[] =>
  players.filter((p) => p.status === "prospect" && p.draftSeason === season);

/** The prospect the AI picks for `cid`: by OVR and POT, plus a bonus for its needs. */
export function aiDraftChoice(
  draft: DraftConfig,
  players: readonly Player[],
  cid: number,
  available: readonly Player[],
): Player | null {
  const { potWeight, needBonus, areaTargets } = draft.aiPick;
  const have = { gk: 0, def: 0, mid: 0, att: 0 };
  for (const p of players) {
    if (p.cid === cid && p.status === "club") have[AREA[p.position]]++;
  }
  let best: Player | null = null;
  let bestValue = -Infinity;
  for (const p of available) {
    const area = AREA[p.position];
    const value =
      (1 - potWeight) * p.ovr +
      potWeight * p.pot +
      needBonus * Math.max(0, areaTargets[area] - have[area]);
    if (value > bestValue) {
      best = p;
      bestValue = value;
    }
  }
  return best;
}

/**
 * Makes pick `dp` on `date`: its owner signs `player` on a rookie contract for the pick's
 * number (none: the pick passes). The pick is used up either way.
 */
export function draftPlayer(
  world: LoopWorld,
  dp: DraftPick,
  player: Player | null,
  date: string,
  log: TurnoverLog,
): void {
  const draft = world.config.competitions.draft;
  world.draftPicks = (world.draftPicks ?? []).filter((p) => p !== dp);
  const club = world.clubs.find((c) => c.cid === dp.cid);
  if (!draft || !player || !club || dp.pick === undefined) return;
  const { season, round, pick, cid } = dp;
  player.status = "club";
  player.cid = cid;
  player.freeAgentSince = null;
  player.contract = {
    wage: rookieWage(draft, pick),
    expires: `${season + 1 + draft.rookieContract.years}-06-30`,
  };
  player.shirtNumber = freeShirtNumber(world, cid, 30);
  player.draft = { season, round, pick, cid, originalCid: dp.originalCid };
  delete player.draftSeason;
  log.changed.add(player.pid);
  player.transfers.push({ date, season, fromCid: null, toCid: cid, fee: 0, type: "draft" });
  log.transactions.push({
    season,
    date,
    type: "draft",
    pids: [player.pid],
    cids: [cid],
    names: [fullName(player), club.name],
    fee: 0,
  });
}

/**
 * Makes `season`'s picks in order on `date`, the AI choosing, until the draft is over, or
 * with `untilUser` until the user's club is on the clock (ZenGM's "Until your pick").
 */
export function makePicks(
  world: LoopWorld,
  season: number,
  date: string,
  untilUser: boolean,
  log: TurnoverLog = emptyLog(),
): TurnoverLog {
  const draft = world.config.competitions.draft;
  if (!draft) return log;
  for (;;) {
    const dp = nextPick(world.draftPicks ?? [], season);
    if (!dp || (untilUser && dp.cid === world.userCid)) break;
    const choice = aiDraftChoice(
      draft,
      world.players,
      dp.cid,
      availableProspects(world.players, season),
    );
    draftPlayer(world, dp, choice, date, log);
  }
  return log;
}

/**
 * Holds all of `season`'s draft (the season just played) on `date`, the AI picking for
 * every club: its order, then every pick, each by the slot's pick owner (the slot's club
 * unless it traded the pick). The prospects not picked stay prospects until 1 July
 * (`draftClassTurnover`). Logs the picked players and a transaction per pick.
 */
export function runDraft(
  world: LoopWorld,
  outcome: SeasonOutcome,
  season: number,
  date: string,
): TurnoverLog {
  const log = setDraftOrder(world, outcome, season, date);
  return makePicks(world, season, date, false, log);
}

/**
 * 1 July in a world with a draft: the prospects nobody picked in June join free agency,
 * the class of the draft `classesAhead` seasons on arrives (three visible, T 2026-10-27),
 * and the clubs get their picks for the draft `picksAhead` seasons on.
 */
export function draftClassTurnover(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  const draft = world.config.competitions.draft;
  if (!draft) return log;
  for (const p of world.players) {
    if (p.status !== "prospect" || (p.draftSeason ?? season) >= season) continue;
    p.status = "freeAgent";
    p.freeAgentSince = date;
    delete p.draftSeason;
    log.changed.add(p.pid);
  }
  const next = draftClass(world, season + draft.classesAhead, date);
  world.players.push(...next);
  log.added.push(...next);
  const picks = world.draftPicks ?? [];
  world.draftPicks = [
    ...picks,
    ...missingPicks(draft, world.clubs, picks, season, season + draft.picksAhead),
  ];
  return log;
}
