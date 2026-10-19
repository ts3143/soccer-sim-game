/**
 * One generated world played for N seasons with the real season loop (the same code as
 * a save: src/worker/season), measuring what the M3 calibration targets ask for.
 * Used by `pnpm calibrate --world` (several worlds in parallel) and `pnpm season`.
 */
import { exactAge } from "../../src/common/dates";
import { competitionsConfig } from "../../src/common/config/competitions";
import type { Club, ClubSeason, Player } from "../../src/common/schema";
import {
  closeSeasonBooks,
  openSeasonBooks,
  operatingRevenue,
} from "../../src/worker/finance/finance";
import { preseasonBoard, targetPosition } from "../../src/worker/club/board";
import { generateWorld } from "../../src/worker/generate/world";
import {
  endOfSeasonTurnover,
  type LoopWorld,
  startingReputation,
  summerTransition,
} from "../../src/worker/season/offseason";
import { type DaysResult, runDays } from "../../src/worker/season/runner";
import {
  applyMoves,
  createSeason,
  finishesOf,
  type LastFinish,
  type SeasonOutcome,
  seasonOutcome,
  type SeasonState,
} from "../../src/worker/season/season";
import { isInjured } from "../../src/worker/season/squads";

export type SeasonMetrics = Record<string, number>;

/** Everything about one played season, for printing (pnpm season). */
export interface SeasonReport {
  index: number;
  state: SeasonState;
  outcome: SeasonOutcome;
  days: DaysResult;
  metrics: SeasonMetrics;
  clubs: Club[];
  /** Every player, as of 1 July after the season (development and turnover applied). */
  players: Player[];
}

/** A whole run: per-season numbers plus the long-run checks. Plain data (sent as JSON). */
export interface WorldRun {
  seed: string;
  seasons: SeasonMetrics[];
  /** ENG1 champion per season. */
  championsENG1: number[];
  /** Active (not retired) players at the start and after each season. */
  activeAtStart: number;
  activeAfter: number[];
  /** Young seniors whose displayed POT was recorded, and how many later beat it. */
  potChecked: number;
  potExceeded: number;
  /** Retirements of players 30+ (leavers excluded): age and whether a goalkeeper. */
  retirements: { age: number; gk: boolean }[];
  /** Clubs promoted to ENG1, and whether they stayed up the next season. */
  promotedSurvived: number;
  promotedChecked: number;
  /** Season 1: each club's revenue against its anchor (ratio − 1), per league. */
  anchorErrors: Record<string, number[]>;
  seconds: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Seasons whose young seniors' displayed POT is recorded for the POT check. */
const POT_SNAPSHOT_SEASONS = 5;

export function simulateWorld(
  seed: string,
  seasons: number,
  onSeason?: (report: SeasonReport) => void,
): WorldRun {
  const started = performance.now();
  const generated = generateWorld({
    seed,
    name: "calibration",
    userCid: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
  });
  const clubs: Club[] = generated.clubs.map((c) => ({ ...c }));
  const players: Player[] = generated.players;
  let nextPid = Math.max(...players.map((p) => p.pid)) + 1;
  const loop: LoopWorld = {
    clubs,
    players,
    reputation: startingReputation(),
    clubSeasons: new Map(generated.clubSeasons.map((r) => [r.cid, r])),
    // No user in the harness: the AI runs every club (dials included).
    userCid: -1,
    seed,
    nextPid: () => nextPid++,
  };
  const active = () => players.filter((p) => p.status !== "retired").length;
  const run: WorldRun = {
    seed,
    seasons: [],
    championsENG1: [],
    activeAtStart: active(),
    activeAfter: [],
    potChecked: 0,
    potExceeded: 0,
    retirements: [],
    promotedSurvived: 0,
    promotedChecked: 0,
    anchorErrors: {},
    seconds: 0,
  };
  const potSnapshot = new Map<number, { pot: number; date: string }>();
  let lastFinish: ReadonlyMap<number, LastFinish> = new Map();
  let promotedLastSeason: number[] = [];
  let firstFid = 1;

  for (let s = 0; s < seasons; s++) {
    const season = competitionsConfig.firstSeason + s;
    const seasonStart = `${season}-07-01`;
    const state = createSeason({ season, seed, clubs, lastFinish, firstFid });
    preseasonBoard(loop, season, seasonStart);
    const start = new Map(
      players
        .filter((p) => p.status !== "retired")
        .map((p) => [p.pid, { ovr: p.ovr, age: exactAge(p.birthDate, seasonStart), cid: p.cid }]),
    );
    if (s < POT_SNAPSHOT_SEASONS) {
      for (const p of players) {
        const age = exactAge(p.birthDate, seasonStart);
        if (p.status === "club" && age >= 17 && age < 22 && !potSnapshot.has(p.pid)) {
          potSnapshot.set(p.pid, { pot: p.pot, date: seasonStart });
        }
      }
    }

    let injuredSamples = 0;
    let injuredTotal = 0;
    const days = runDays(loop, state, seasonStart, {
      limit: null,
      onDay: (date) => {
        for (const club of clubs) {
          injuredTotal += players.filter(
            (p) => p.cid === club.cid && p.status === "club" && isInjured(p, date),
          ).length;
          injuredSamples++;
        }
      },
    });
    const outcome = seasonOutcome(state);
    firstFid = state.nextFid;

    // Minutes per club per player, the minutes each club had to give, league scorers.
    const minutes = new Map<number, Map<number, number>>();
    const available = new Map<number, number>();
    const goalsBy = new Map<string, Map<number, [number, number]>>();
    for (const { fixture, result } of days.played) {
      const length = result.extraTime ? 120 : 90;
      for (const cid of [fixture.homeCid, fixture.awayCid]) {
        available.set(cid, (available.get(cid) ?? 0) + length);
      }
      const g = goalsBy.get(fixture.competition) ?? new Map<number, [number, number]>();
      goalsBy.set(fixture.competition, g);
      for (const p of result.players) {
        const cid = p.side === 0 ? fixture.homeCid : fixture.awayCid;
        const club = minutes.get(cid) ?? new Map<number, number>();
        club.set(p.pid, (club.get(p.pid) ?? 0) + p.minutes);
        minutes.set(cid, club);
        const [goals, assists] = g.get(p.pid) ?? [0, 0];
        g.set(p.pid, [goals + p.goals, assists + p.assists]);
      }
    }

    // Top clubs (4 strongest of each top flight): share of minutes of their 11 most used.
    const topClubs = ["ENG1", "GER1"].flatMap((id) =>
      clubs
        .filter((c) => c.leagueId === id)
        .sort((a, b) => b.strengthTarget - a.strengthTarget)
        .slice(0, 4),
    );
    const shares = topClubs.map((club) => {
      const used = [...(minutes.get(club.cid) ?? new Map<number, number>()).values()]
        .sort((a, b) => b - a)
        .slice(0, 11)
        .reduce((sum, m) => sum + m, 0);
      return used / (11 * (available.get(club.cid) ?? 1));
    });
    const parity = (leagueId: string) => {
      const table = outcome.tables[leagueId] ?? [];
      const top = new Set(table.slice(0, 6).map((r) => r.cid));
      const bottom = new Set(table.slice(-6).map((r) => r.cid));
      let meetings = 0;
      let upsets = 0;
      for (const f of state.fixtures) {
        const r = f.result;
        if (f.competition !== leagueId || !r) continue;
        if (top.has(f.homeCid) && bottom.has(f.awayCid)) {
          meetings++;
          if (r.homeGoals < r.awayGoals) upsets++;
        } else if (top.has(f.awayCid) && bottom.has(f.homeCid)) {
          meetings++;
          if (r.awayGoals < r.homeGoals) upsets++;
        }
      }
      return upsets / Math.max(1, meetings);
    };
    const lengths = days.injuries;
    const share = (test: (d: number) => boolean) =>
      lengths.filter(test).length / Math.max(1, lengths.length);
    const eng1 = outcome.tables.ENG1 ?? [];
    const scorers = [...(goalsBy.get("ENG1") ?? new Map<number, [number, number]>()).values()];
    const metrics: SeasonMetrics = {
      championPointsENG1: eng1[0]?.points ?? 0,
      bottomPointsENG1: eng1.at(-1)?.points ?? 0,
      topScorerGoals: Math.max(...scorers.map(([g]) => g)),
      topAssists: Math.max(...scorers.map(([, a]) => a)),
      injuredPerSquadAtOnce: injuredTotal / Math.max(1, injuredSamples),
      top6LoseToBottom6Pct: parity("ENG1"),
      parityENG2: parity("ENG2"),
      parityGER1: parity("GER1"),
      topClubStarterMinutesShare: mean(shares),
      injuriesPerTeamMatch: (lengths.length - days.trainingInjuries) / (2 * state.fixtures.length),
      trainingInjuryShare: days.trainingInjuries / Math.max(1, lengths.length),
      injuryOneToThreeWeeks: share((d) => d >= 7 && d <= 21),
      injuryFourWeeksPlus: share((d) => d >= 28),
      injurySeasonEnding: share((d) => d >= 120),
    };

    // Promoted clubs: did last season's promoted clubs stay up?
    const relegated = new Set(
      outcome.moves.filter((m) => m.reason === "relegated").map((m) => m.cid),
    );
    for (const cid of promotedLastSeason) {
      run.promotedChecked++;
      if (!relegated.has(cid)) run.promotedSurvived++;
    }
    promotedLastSeason = outcome.moves
      .filter((m) => m.reason !== "relegated" && m.to === "ENG1")
      .map((m) => m.cid);
    run.championsENG1.push(outcome.champions.ENG1 ?? -1);

    // End of season and the summer: retirements, development, intake.
    const endDate = `${season + 1}-06-01`;
    const retired = endOfSeasonTurnover(loop, season, endDate);
    for (const p of players) {
      if (!retired.changed.has(p.pid)) continue;
      const age = exactAge(p.birthDate, endDate);
      if (age >= 30) run.retirements.push({ age, gk: p.position === "GK" });
    }
    // Club standing and the board (information): would-be sackings, targets met, reputation.
    const seasonRows = [...loop.clubSeasons.values()];
    const met = seasonRows.filter((r) => {
      const target = targetPosition(r.leagueId, r.boardExpectation);
      return r.finish !== null && r.finish <= target;
    }).length;
    const leagueRep = (id: string) =>
      mean(seasonRows.filter((r) => r.leagueId === id).map((r) => r.reputation));
    Object.assign(metrics, {
      sackedMidSeason: days.sackings.filter((x) => !x.seasonEnd).length / clubs.length,
      sackedAtSeasonEnd: days.sackings.filter((x) => x.seasonEnd).length / clubs.length,
      boardTargetMet: met / seasonRows.length,
      boardConfidenceMean: mean(seasonRows.map((r) => r.boardConfidence ?? 0)),
      hypeMean: mean(seasonRows.map((r) => r.hype)),
      hypeSpread:
        Math.max(...seasonRows.map((r) => r.hype)) - Math.min(...seasonRows.map((r) => r.hype)),
      reputationENG1: leagueRep("ENG1"),
      reputationENG2: leagueRep("ENG2"),
      reputationGER1: leagueRep("GER1"),
      aiDialMean: mean(clubs.map((c) => c.budget.coaching)),
      facilitiesMean: mean(clubs.map((c) => c.facilitiesLevel ?? 50)),
    });

    // Money: month-ends to 30 June and the season's cash snapshot, before anyone moves on.
    const lastDay = state.fixtures.reduce((d, f) => (f.date > d ? f.date : d), seasonStart);
    const ffp = closeSeasonBooks(loop, season, lastDay, -1);
    const rows = [...loop.clubSeasons.values()];
    const revenueOf = (r: ClubSeason) => operatingRevenue(r.revenue);
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const wageRatio = rows.map((r) => (r.expenses.wages ?? 0) / Math.max(1, revenueOf(r)));
    const mix = (kinds: string[]) =>
      rows.reduce((sum, r) => sum + kinds.reduce((k, kind) => k + (r.revenue[kind] ?? 0), 0), 0) /
      rows.reduce((sum, r) => sum + revenueOf(r), 0);
    Object.assign(metrics, {
      negativeCashShare: clubs.filter((c) => c.cash < 0).length / clubs.length,
      medianWageRatio: median(wageRatio),
      medianSquadCostRatio: median(rows.map((r) => r.squadCostRatio ?? 0)),
      ffpBreachShare: ffp.breaches.length / clubs.length,
      ffpBanShare: ffp.bans.length / clubs.length,
      medianCashToRevenue: median(rows.map((r) => (r.cashEnd ?? 0) / Math.max(1, revenueOf(r)))),
      revenueShareMatchday: mix(["matchday"]),
      revenueShareBroadcast: mix(["broadcast", "merit"]),
      revenueShareCommercial: mix(["commercial"]),
      revenueSharePrize: mix(["prize"]),
    });
    if (s === 0) {
      for (const league of competitionsConfig.leagues) {
        const own = rows.filter((r) => r.leagueId === league.id);
        const errors = own.map((r) => {
          const club = clubs.find((c) => c.cid === r.cid) as Club;
          return revenueOf(r) / club.revenueAnchor - 1;
        });
        run.anchorErrors[league.id] = errors;
      }
    }

    applyMoves(clubs, outcome.moves);
    const intakeFrom = nextPid;
    const summer = summerTransition(loop, state);
    const count = (type: string, list = summer.transactions) =>
      list.filter((t) => t.type === type).length;
    Object.assign(metrics, {
      contractsExpired:
        summer.transactions.filter((t) => t.names[1]?.endsWith("(contract ended)")).length /
        clubs.length,
      renewals: (count("renewal") + count("renewal", days.transactions)) / clubs.length,
      transfers: count("transfer", days.transactions) / clubs.length,
      freeAgentSignings: count("freeAgent", days.transactions) / clubs.length,
      loans: count("loan", days.transactions) / clubs.length,
      feesToRevenue:
        days.transactions.filter((t) => t.type === "transfer").reduce((a, t) => a + t.fee, 0) /
        Math.max(
          1,
          rows.reduce((a, r) => a + revenueOf(r), 0),
        ),
      seniorsPerClub: players.filter((p) => p.status === "club").length / clubs.length,
      freeAgentPool: players.filter((p) => p.status === "freeAgent").length,
    });
    loop.clubSeasons = openSeasonBooks(clubs, loop.clubSeasons, season + 1, -1);
    for (const [cid, row] of loop.clubSeasons) loop.reputation.set(cid, row.reputation);
    const changes = [...start].flatMap(([pid, before]) => {
      const p = players.find((x) => x.pid === pid);
      if (!p || p.status === "retired") return [];
      // His minutes wherever he played (loans and transfers), against the club he played
      // most for.
      let total = 0;
      let main: number | null = null;
      for (const [cid, club] of minutes) {
        const m = club.get(pid) ?? 0;
        total += m;
        if (m > 0 && (main === null || m > (minutes.get(main)?.get(pid) ?? 0))) main = cid;
      }
      const played = main === null ? 0 : total / (available.get(main) ?? 1);
      return [{ age: before.age, delta: p.ovr - before.ovr, share: played }];
    });
    const young = changes.filter((c) => c.age >= 18 && c.age < 22);
    const intake = players.filter((p) => p.pid >= intakeFrom);
    const seniorsNow = players.filter((p) => p.status === "club");
    const nextStart = `${season + 1}-07-01`;
    const bandMean = (lo: number, hi: number) =>
      mean(
        seniorsNow
          .filter((p) => {
            const age = exactAge(p.birthDate, nextStart);
            return age >= lo && age < hi;
          })
          .map((p) => p.ovr),
      );
    Object.assign(metrics, {
      ovrAge18to20: bandMean(18, 21),
      ovrAge21to23: bandMean(21, 24),
      ovrAge24to26: bandMean(24, 27),
      ovrAge27to29: bandMean(27, 30),
      ovrAge30to32: bandMean(30, 33),
      ovrAge33plus: bandMean(33, 50),
      seniorMeanOvr: mean(seniorsNow.map((p) => p.ovr)),
      elite75Share: seniorsNow.filter((p) => p.ovr >= 75).length / Math.max(1, seniorsNow.length),
      wellPlayed18to21OvrGainPerYear: mean(young.filter((c) => c.share >= 0.5).map((c) => c.delta)),
      benched18to21OvrGainPerYear: mean(young.filter((c) => c.share < 0.15).map((c) => c.delta)),
      age33plusOvrLossPerYear: -mean(changes.filter((c) => c.age >= 33).map((c) => c.delta)),
      wonderkidsPerLeaguePerSeason:
        intake.filter((p) => p.pot >= 75).length / competitionsConfig.leagues.length,
      youthIntake: intake.length,
    });
    run.seasons.push(metrics);
    run.activeAfter.push(active());
    onSeason?.({ index: s, state, outcome, days, metrics, clubs, players });
    lastFinish = finishesOf(outcome);
  }

  // Displayed POT: how many young seniors later beat what was shown.
  for (const [pid, snap] of potSnapshot) {
    const p = players.find((x) => x.pid === pid);
    if (!p) continue;
    const peak = Math.max(...p.ratingsHistory.filter((r) => r.date > snap.date).map((r) => r.ovr));
    run.potChecked++;
    if (peak > snap.pot) run.potExceeded++;
  }
  run.seconds = (performance.now() - started) / 1000;
  return run;
}
