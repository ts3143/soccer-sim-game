import { yearsLeft } from "../market/market";
import { ratingChanges } from "../../common/ratingChanges";
/**
 * The Tactics page (M6, SPEC §11): a club's line-up by slot, the bench and everyone else
 * who can play, with slot OVRs, condition and the live team ratings. The user edits and
 * saves his; other clubs show the AI's pick for an ordinary match today.
 */
import type { TacticsMode, TacticsPlayerView, TacticsSetup, TacticsView } from "../../common/api";
import { formationById, formationsConfig, slotLabel } from "../../common/config/formations";
import { exactAge, formatDay } from "../../common/dates";
import type { Club, GameMeta, Player, PlayerStatsRow } from "../../common/schema";
import { effectiveDials } from "../club/standing";
import {
  autoSetup,
  checkSetup,
  cleanSetup,
  currentSetup,
  reslot,
  selectable,
  setupRatings,
} from "../club/tactics";
import { isSuspended } from "../season/discipline";
import { slotOvr } from "../core/ovr";
import type { TeamRatings } from "../engine/teamRatings";
import { queued } from "../league/game";
import type { LeagueSession } from "../league/session";
import { openLeague } from "../league/session";
import { currentCondition, isInjured } from "../season/squads";
import { teamRef } from "./common";
import { GameError } from "../../common/errors";

const RATING_LABELS: Record<string, string> = {
  passing: "Passing",
  attack: "Attack",
  pressing: "Pressing",
  defence: "Defence",
  aerial: "Aerial",
  setPieces: "Set pieces",
  goalkeeping: "Goalkeeping",
};
/** The seven team ratings as the pages list them, to one decimal. */
export function ratingRows(ratings: TeamRatings): TacticsView["ratings"] {
  return Object.entries(RATING_LABELS).map(([key, label]) => ({
    key,
    label,
    value: Math.round(ratings[key as keyof TeamRatings] * 10) / 10,
  }));
}

/** Below this condition a starter's injury risk rises sharply (SPEC §8.4). */
const RISKY_CONDITION = 75;

function context(session: LeagueSession, cid: number | null) {
  const game = session.cache.get("meta", "game") as GameMeta;
  const club = session.cache.get("clubs", cid ?? game.userCid);
  if (!club) throw new GameError(`There's no club ${cid ?? game.userCid} in this league.`);
  const players = session.cache.getAll("players");
  const pickable = selectable(players, club.cid, game.date);
  return { game, club, players, pickable, byPid: new Map(pickable.map((p) => [p.pid, p])) };
}

export function tacticsView(
  club: Club,
  setup: TacticsSetup,
  pickable: readonly Player[],
  byPid: ReadonlyMap<number, Player>,
  date: string,
  editable: boolean,
  stats: readonly PlayerStatsRow[] = [],
  unavailable?: readonly Player[],
): TacticsView {
  const medical = effectiveDials(club).medical;
  const formation = formationById(setup.formation);
  const player = (p: Player, inSlot: number | null): TacticsPlayerView => {
    const slot = inSlot === null ? undefined : formation.slots[inSlot];
    const rows = stats.filter((r) => r.pid === p.pid && r.cid === club.cid);
    const total = (key: "appearances" | "minutes" | "goals" | "assists" | "ratingTotal") =>
      rows.reduce((sum, r) => sum + r[key], 0);
    const apps = total("appearances");
    return {
      season: {
        appearances: apps,
        minutes: total("minutes"),
        goals: total("goals"),
        assists: total("assists"),
        rating: apps ? total("ratingTotal") / apps : null,
      },
      ...ratingChanges(p, Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0)),
      nationality: p.nationality,
      ratings: p.ratingsHistory.at(-1)?.ratings ?? [],
      pot: p.pot,
      suspension: p.suspension?.remaining ?? 0,
      listed: p.status === "club" ? (p.listed ?? null) : null,
      expires: p.contract?.expires ?? null,
      expiring: p.status !== "academy" && yearsLeft(p, date) === 1,
      today: date,
      pid: p.pid,
      name: `${p.firstName} ${p.lastName}`.trim(),
      position: p.position,
      secondary: p.secondaryPositions,
      age: Math.floor(exactAge(p.birthDate, date)),
      ovr: p.ovr,
      slotOvr: slot ? Math.round(slotOvr(p, slot)) : p.ovr,
      slotOvrs: formation.slots.map((s) => Math.round(slotOvr(p, s))),
      bestOvr: Math.round(Math.max(...p.ovrs)),
      condition: Math.round(currentCondition(p, date, medical)),
      injury:
        p.injury && isInjured(p, date) ? { type: p.injury.type, until: p.injury.until } : null,
      academy: p.status === "academy",
      loanee: p.status === "loan",
    };
  };
  const slots = formation.slots.map((slot, i) => {
    const p = byPid.get(setup.slots[i] ?? -1);
    return { label: slotLabel(slot), position: slot.position, player: p ? player(p, i) : null };
  });
  const bench = setup.bench.flatMap((pid) => {
    const p = byPid.get(pid);
    return p ? [player(p, null)] : [];
  });
  const named = new Set([...setup.slots, ...setup.bench]);
  const reserves = pickable
    .filter((p) => !named.has(p.pid))
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .map((p) => player(p, null));

  const warnings: string[] = [];
  const empty = slots.filter((s) => s.player === null).length;
  if (empty > 0) warnings.push(`${empty} slot${empty === 1 ? " is" : "s are"} empty.`);
  for (const s of slots) {
    const p = s.player;
    if (!p) continue;
    if (p.injury)
      warnings.push(`${p.name} (${s.label}) is injured until ${formatDay(p.injury.until)}.`);
    else if (p.condition < RISKY_CONDITION) {
      warnings.push(`${p.name} (${s.label}) is at ${p.condition}% condition: a high injury risk.`);
    }
  }
  if (bench.length > 0 && !bench.some((p) => p.position === "GK")) {
    warnings.push("No goalkeeper on the bench.");
  }
  const injuredSubs = bench.filter((p) => p.injury).length;
  if (injuredSubs > 0) {
    warnings.push(`${injuredSubs} injured player${injuredSubs === 1 ? "" : "s"} on the bench.`);
  }

  const ratings = setupRatings(club, setup, byPid, date);
  return {
    team: teamRef(club),
    editable,
    saved: club.tactics.lineup !== undefined,
    setup,
    slots,
    bench,
    reserves,
    ...(unavailable && {
      unavailable: [...unavailable]
        .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
        .map((p) => player(p, null)),
    }),
    ratings: ratingRows(ratings),
    warnings,
    benchSize: formationsConfig.benchSize,
  };
}

export async function getTactics(lid: number, cid: number | null): Promise<TacticsView> {
  const session = await openLeague(lid);
  const { game, club, players, pickable, byPid } = context(session, cid);
  const user = club.cid === game.userCid;
  const setup = user ? currentSetup(club, players, game.date) : autoSetup(club, players, game.date);
  return tacticsView(
    club,
    setup,
    pickable,
    byPid,
    game.date,
    user,
    session.cache.getAll("playerStats").filter((r) => r.season === game.season),
  );
}

export async function previewTactics(
  lid: number,
  setup: TacticsSetup,
  mode: TacticsMode,
): Promise<TacticsView> {
  const session = await openLeague(lid);
  const { game, club, players, pickable, byPid } = context(session, null);
  const ids = new Set([...byPid.values()].filter((p) => !isSuspended(p)).map((p) => p.pid));
  let next: TacticsSetup;
  if (mode === "saved") {
    next = currentSetup(club, players, game.date);
  } else if (mode === "auto") {
    const pick = autoSetup(
      { ...club, tactics: { ...club.tactics, formation: setup.formation } },
      players,
      game.date,
    );
    next = { ...pick, sliders: setup.sliders };
  } else {
    const clean = cleanSetup({ ...setup, slots: [...setup.slots] }, ids);
    next = mode === "reslot" ? reslot(clean, setup.formation, byPid) : clean;
  }
  checkSetup(next, ids);
  return tacticsView(
    club,
    next,
    pickable,
    byPid,
    game.date,
    true,
    session.cache.getAll("playerStats").filter((r) => r.season === game.season),
  );
}

export async function saveTactics(lid: number, setup: TacticsSetup): Promise<TacticsView> {
  const session = await openLeague(lid);
  await queued(session, async () => {
    const { club, byPid } = context(session, null);
    checkSetup(
      setup,
      new Set([...byPid.values()].filter((p) => !isSuspended(p)).map((p) => p.pid)),
    );
    session.cache.put("clubs", {
      ...club,
      tactics: {
        formation: setup.formation,
        sliders: { ...setup.sliders },
        lineup: { slots: [...setup.slots], bench: [...setup.bench] },
      },
    });
    await session.cache.flush();
  });
  return getTactics(lid, null);
}
