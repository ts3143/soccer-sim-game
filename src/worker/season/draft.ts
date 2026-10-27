/**
 * The draft (SPEC §17.5), its AI core: each June a class of prospects, the pick order from
 * the season's tables, and every club picking by value and need, two rounds in the same
 * order. Rookies sign rookie contracts; prospects nobody picks become free agents. The
 * lottery draw, the user's own picks and traded picks arrive in SL4: until then the pool
 * picks in odds order and the AI picks for the user too.
 */
import type { DraftConfig } from "../../common/config/competitions";
import type { WorldConfig } from "../../common/config/worlds";
import { ratingsConfig, type Side } from "../../common/config/ratings";
import type { Player } from "../../common/schema";
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
 * One round's pick order (every round alike), first pick first: the lottery pool in odds
 * order; the other clubs in reverse combined standings (the lowest tier first, each from
 * the bottom of its table); the promoted clubs last, by the same rule.
 */
export function draftOrder(
  draft: DraftConfig,
  outcome: SeasonOutcome,
  tiers: ReadonlyMap<string, number>,
): number[] {
  const pool = draft.lotteryPool.map((slot) => {
    const cid = outcome.tables[slot.league]?.[slot.position - 1]?.cid;
    if (cid === undefined) throw new Error(`No ${slot.league} ${slot.position} for the draft`);
    return cid;
  });
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

/** What generating a class needs: the world, the save's seed and new player IDs. */
export interface ClassSetup {
  config: WorldConfig;
  seed: string;
  nextPid: () => number;
}

/**
 * The class of `season`'s draft (held the next June), generated on `date` (1 July): aged
 * per the config at the draft, prospects until then, viewable all season (SPEC §17.5).
 */
export function draftClass(setup: ClassSetup, season: number, date: string): Player[] {
  const draft = setup.config.competitions.draft;
  if (!draft) return [];
  const draftDate = seasonDate(season, setup.config.competitions.keyDates.draft ?? "06-15");
  const rng = Random.fromSeed(`${setup.seed}/draft/${season}`);
  const q = draft.prospectQuality;
  const mix = worldMix(setup.config);
  return Array.from({ length: draft.classSize }, () => {
    const position = rng.weighted(ACADEMY_POSITIONS, ([, w]) => w)[0];
    const side: Side = ratingsConfig.sidedPositions.includes(position)
      ? rng.choice(["L", "R"] as const)
      : "C";
    const age = rng.int(draft.ages.min, draft.ages.max);
    const talent = rng.normal(0, 1);
    const quality = clamp(
      q.mean + q.perYear * (age - draft.ages.min) + talent * q.sd,
      q.min,
      q.max,
    );
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
    player.hidden.ceiling = capCeiling(
      player.hidden.ceiling + talent * q.talentHeadroom,
      player.ovr,
    );
    updatePot(player, date, undefined, setup.seed);
    return player;
  });
}

/**
 * Holds the draft of `season` (the season just played) on `date`: every club in
 * `draftOrder` picks the prospect it values most, for each round. The prospects not picked
 * stay prospects until 1 July (`draftClassTurnover`). A world without a class yet (none
 * so far) gets one here. Logs the picked players and a transaction per pick.
 */
export function runDraft(
  world: LoopWorld,
  outcome: SeasonOutcome,
  season: number,
  date: string,
): TurnoverLog {
  const log = emptyLog();
  const draft = world.config.competitions.draft;
  if (!draft) return log;
  const tiers = new Map(world.config.competitions.leagues.map((l) => [l.id, l.tier]));
  const order = draftOrder(draft, outcome, tiers);
  let prospects = world.players.filter((p) => p.status === "prospect");
  if (prospects.length === 0) {
    prospects = draftClass(world, season, date);
    world.players.push(...prospects);
    log.added.push(...prospects);
  }
  const available = new Set(prospects);
  const { potWeight, needBonus, areaTargets } = draft.aiPick;
  let pick = 0;
  for (let round = 1; round <= draft.rounds; round++) {
    for (const cid of order) {
      pick++;
      const club = world.clubs.find((c) => c.cid === cid);
      if (!club || available.size === 0) continue;
      const have = { gk: 0, def: 0, mid: 0, att: 0 };
      for (const p of world.players) {
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
      if (!best) continue;
      available.delete(best);
      best.status = "club";
      best.cid = cid;
      best.freeAgentSince = null;
      best.contract = {
        wage: rookieWage(draft, pick),
        expires: `${season + 1 + draft.rookieContract.years}-06-30`,
      };
      best.shirtNumber = freeShirtNumber(world, cid, 30);
      best.draft = { season, round, pick, cid };
      log.changed.add(best.pid);
      best.transfers.push({ date, season, fromCid: null, toCid: cid, fee: 0, type: "draft" });
      log.transactions.push({
        season,
        date,
        type: "draft",
        pids: [best.pid],
        cids: [cid],
        names: [fullName(best), club.name],
        fee: 0,
      });
    }
  }
  return log;
}

/**
 * 1 July in a world with a draft: the prospects nobody picked join free agency, and the
 * class of this season's draft (next June) is generated.
 */
export function draftClassTurnover(world: LoopWorld, season: number, date: string): TurnoverLog {
  const log = emptyLog();
  for (const p of world.players) {
    if (p.status !== "prospect") continue;
    p.status = "freeAgent";
    p.freeAgentSince = date;
    log.changed.add(p.pid);
  }
  const next = draftClass(world, season, date);
  world.players.push(...next);
  log.added.push(...next);
  return log;
}
