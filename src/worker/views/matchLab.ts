/**
 * M2 Match lab (developer-only page, replaced by Watch live in M6): simulate a match
 * between any two clubs of a saved league, step through one possession by possession,
 * or simulate a batch and compare the averages with the calibration targets.
 */
import targetsJson from "../../../data/config/calibration_targets.json";
import type {
  LabBatch,
  LabLiveStart,
  LabLiveStep,
  LabMatch,
  LabMatchSetup,
  LabTeam,
} from "../../common/api";
import { leagueById } from "../../common/config/competitions";
import type { Club, Player } from "../../common/schema";
import { Random } from "../core/random";
import {
  matchResult,
  simulateMatch,
  startMatch,
  stepMatch,
  type MatchState,
} from "../engine/match";
import { perMatch } from "../engine/metrics";
import { prepareMatch } from "../engine/prepare";
import type { EngineTeamInput, MatchInput } from "../engine/types";
import { openLeague } from "../league/session";

const NEUTRAL = { chanceQuality: 1, foulRate: 1, directness: 0 };

async function loadSides(lid: number) {
  const { cache } = await openLeague(lid);
  const clubs = new Map(cache.getAll("clubs").map((c) => [c.cid, c]));
  const players = cache.getAll("players");
  const squad = (cid: number): Player[] => players.filter((p) => p.cid === cid);
  return { clubs, players, squad };
}

function labTeam(club: Club, input: EngineTeamInput): LabTeam {
  return {
    cid: club.cid,
    name: club.name,
    code: club.code,
    abbr: club.abbr,
    formation: input.formation,
    sliders: input.sliders,
  };
}

async function buildInput(setup: LabMatchSetup, feed: boolean) {
  const { clubs, players, squad } = await loadSides(setup.lid);
  const home = clubs.get(setup.homeCid);
  const away = clubs.get(setup.awayCid);
  if (!home || !away || home === away) throw new RangeError("Pick two different clubs");
  // A league match uses that league's style; clubs from different leagues play neutral.
  const style =
    home.leagueId === away.leagueId ? leagueById(home.leagueId).styleModifiers : NEUTRAL;
  const input = prepareMatch(
    { club: home, squad: squad(home.cid) },
    { club: away, squad: squad(away.cid) },
    { seed: setup.seed || "lab", style, feed },
  );
  const inSquad = new Set([...input.home.players, ...input.away.players].map((p) => p.pid));
  const names: LabMatch["players"] = {};
  for (const p of players) {
    if (inSquad.has(p.pid))
      names[p.pid] = { name: `${p.firstName} ${p.lastName}`, shirtNumber: p.shirtNumber };
  }
  return { input, home: labTeam(home, input.home), away: labTeam(away, input.away), names };
}

export async function simulateLabMatch(setup: LabMatchSetup): Promise<LabMatch> {
  const { input, home, away, names } = await buildInput(setup, false);
  return { seed: input.seed, home, away, players: names, result: simulateMatch(input) };
}

const live = new Map<number, { state: MatchState; input: MatchInput }>();
let nextLiveId = 1;

export async function startLabMatch(setup: LabMatchSetup): Promise<LabLiveStart> {
  const { input, home, away, names } = await buildInput(setup, true);
  const id = nextLiveId++;
  live.set(id, { state: startMatch(input), input });
  for (const old of [...live.keys()].filter((k) => k < id - 4)) live.delete(old); // keep a few
  return { id, seed: input.seed, home, away, players: names };
}

export function stepLabMatch(id: number, possessions: number): LabLiveStep {
  const session = live.get(id);
  if (!session) throw new RangeError("That match is no longer running; start it again");
  const { state, input } = session;
  const events = stepMatch(state, Math.max(1, Math.floor(possessions)));
  let result = null;
  let identical: boolean | null = null;
  if (state.finished) {
    result = matchResult(state);
    // Proof of the resumable engine: the stepped match equals an instant sim (feed off).
    identical = JSON.stringify(result) === JSON.stringify(simulateMatch({ ...input, feed: false }));
    live.delete(id);
  }
  return {
    events,
    clock: state.clock,
    period: state.period,
    score: [state.score[0], state.score[1]],
    finished: state.finished,
    result,
    identicalToInstant: identical,
  };
}

interface Band {
  target: number;
  tol: number[];
}

export async function runLabBatch(lid: number, matches: number): Promise<LabBatch> {
  const { clubs, squad } = await loadSides(lid);
  const byLeague = new Map<string, Club[]>();
  for (const club of clubs.values())
    byLeague.set(club.leagueId, [...(byLeague.get(club.leagueId) ?? []), club]);
  const leagues = [...byLeague.keys()];
  const rng = Random.fromSeed(`lab-batch/${lid}/${matches}`);
  const results = [];
  const started = performance.now();
  const n = Math.min(5000, Math.max(1, Math.floor(matches)));
  for (let i = 0; i < n; i++) {
    const pool = byLeague.get(rng.choice(leagues)) ?? [];
    const [home, away] = rng.shuffle(pool).slice(0, 2) as [Club, Club];
    const input = prepareMatch(
      { club: home, squad: squad(home.cid) },
      { club: away, squad: squad(away.cid) },
      { seed: `lab-batch/${i}`, style: NEUTRAL },
    );
    results.push(simulateMatch(input));
  }
  const msPerMatch = (performance.now() - started) / n;
  const measured = perMatch(results);
  const rows = Object.entries(
    targetsJson.perMatch as unknown as Record<string, Band | string>,
  ).flatMap(([metric, spec]) => {
    if (metric === "possessionRange") {
      // A share target: 95% of team-matches within 30-70% possession.
      const value = measured.possessionInRange ?? 0;
      return [{ metric, value, target: 0.95, low: 0.95, high: 1, pass: value >= 0.95 }];
    }
    if (typeof spec !== "object" || measured[metric] === undefined) return [];
    const value = measured[metric];
    const [low = -Infinity, high = Infinity] = spec.tol;
    return [{ metric, value, target: spec.target, low, high, pass: value >= low && value <= high }];
  });
  return { matches: n, msPerMatch, rows };
}
