/**
 * Builds engine input from saved data. M2 uses each club's best XI in its formation and
 * a bench covering every area (a keeper, defenders, midfielders, forwards), and the AI's
 * pre-match sliders for clubs on Auto. M3's rotation AI replaces the selection with
 * condition- and fixture-aware choices.
 */
import type { StyleModifiers } from "../../common/config/competitions";
import { formationById, formationsConfig } from "../../common/config/formations";
import type { Position } from "../../common/config/ratings";
import type { Club, Player } from "../../common/schema";
import { bestXi } from "../core/lineup";
import { aiSliders } from "./aiTactics";
import type { EnginePlayer, EngineTeamInput, KnockoutRules, MatchInput } from "./types";

export function enginePlayer(player: Player): EnginePlayer {
  const ratings = player.ratingsHistory[player.ratingsHistory.length - 1]?.ratings;
  if (!ratings) throw new Error(`Player ${player.pid} has no ratings`);
  return {
    pid: player.pid,
    ratings,
    condition: player.condition,
    foot: player.foot,
    injuryProne: player.hidden.injuryProne,
    hothead: player.hidden.hothead,
  };
}

const AREA: Record<Position, "gk" | "def" | "mid" | "att"> = {
  GK: "gk", CB: "def", FB: "def", WB: "def", DM: "mid", CM: "mid", WM: "mid", AM: "att", W: "att", ST: "att",
}; // prettier-ignore
/** Bench minimums by area, filled before the best of the rest. */
const BENCH_MINIMUM = { gk: 1, def: 2, mid: 2, att: 2 };

function pickBench(rest: Player[], size: number): Player[] {
  const sorted = [...rest].sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  const bench: Player[] = [];
  for (const [area, minimum] of Object.entries(BENCH_MINIMUM)) {
    bench.push(...sorted.filter((p) => AREA[p.position] === area).slice(0, minimum));
  }
  for (const p of sorted) {
    if (bench.length >= size) break;
    if (!bench.includes(p) && AREA[p.position] !== "gk") bench.push(p);
  }
  return bench.slice(0, size);
}

/** Matchday squad for a club: best XI in its formation plus up to 9 substitutes. */
export function teamInput(club: Club, squad: readonly Player[]): EngineTeamInput {
  const available = squad.filter((p) => p.status === "club" && p.injury === null);
  const formation = formationById(club.tactics.formation);
  const xi = bestXi(available, formation);
  const lineup = xi.playerIndexBySlot.map((i) => (available[i] as Player).pid);
  const rest = available.filter((p) => !lineup.includes(p.pid));
  const bench = pickBench(rest, formationsConfig.benchSize).map((p) => p.pid);
  const inSquad = new Set([...lineup, ...bench]);
  return {
    cid: club.cid,
    formation: formation.id,
    lineup,
    bench,
    players: available.filter((p) => inSquad.has(p.pid)).map(enginePlayer),
    sliders: { ...club.tactics.sliders },
    autoManage: club.tactics.auto,
    medicalDial: club.budget.medical,
  };
}

export interface MatchSetup {
  seed: string;
  style: StyleModifiers;
  neutralVenue?: boolean;
  knockout?: KnockoutRules | null;
  feed?: boolean;
}

/** A full match input; clubs on Auto get the AI's pre-match sliders for this opponent. */
export function prepareMatch(
  home: { club: Club; squad: readonly Player[] },
  away: { club: Club; squad: readonly Player[] },
  setup: MatchSetup,
): MatchInput {
  const homeTeam = teamInput(home.club, home.squad);
  const awayTeam = teamInput(away.club, away.squad);
  const neutral = setup.neutralVenue ?? false;
  if (homeTeam.autoManage) {
    homeTeam.sliders = aiSliders(homeTeam, awayTeam, !neutral, setup.style.directness);
  }
  if (awayTeam.autoManage) {
    awayTeam.sliders = aiSliders(awayTeam, homeTeam, false, setup.style.directness);
  }
  return {
    seed: setup.seed,
    home: homeTeam,
    away: awayTeam,
    neutralVenue: neutral,
    style: setup.style,
    knockout: setup.knockout ?? null,
    feed: setup.feed ?? false,
  };
}
