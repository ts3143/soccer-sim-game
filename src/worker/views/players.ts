/**
 * The Squad page and the player profile (M5, SPEC §11): any club's players with
 * contracts (expiry badges), condition, injuries, value, mood and season stats; one
 * player's bio, contract, mood breakdown, condition, ratings and transfer history.
 */
import type { PlayerView, SquadPlayerView, TeamSquadView } from "../../common/api";
import { exactAge } from "../../common/dates";
import { competitionsConfig } from "../../common/config/competitions";
import { formationById } from "../../common/config/formations";
import { POSITIONS, RATING_CODES, ratingsConfig } from "../../common/config/ratings";
import type { Club, GameMeta, Player } from "../../common/schema";
import { contractClub, isSenior } from "../../common/status";
import { effectiveDials } from "../club/standing";
import { bestXi } from "../core/lineup";
import { loopWorld } from "../league/game";
import { openLeague } from "../league/session";
import { marketValue, yearsLeft } from "../market/market";
import { clubLevels, moodAtClub } from "../market/renewals";
import { leagueLevel } from "../market/transfers";
import { currentCondition, isInjured } from "../season/squads";
import { competitionName, leagueTables, seasonFixtures, teamRef } from "./common";

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();
const positionOrder = (p: Player) => POSITIONS.indexOf(p.position);

export async function getTeamSquad(lid: number, cid: number): Promise<TeamSquadView> {
  const session = await openLeague(lid);
  const { cache } = session;
  const game = cache.get("meta", "game") as GameMeta;
  const club = cache.get("clubs", cid);
  if (!club) throw new Error(`No club ${cid}`);
  const world = loopWorld(session, game.season);
  const clubs = new Map<number, Club>(world.clubs.map((c) => [c.cid, c]));
  const levels = clubLevels(world, game.date);
  const level = leagueLevel(world, club.leagueId, game.date);
  const medical = effectiveDials(club).medical;
  const stats = new Map<
    number,
    { appearances: number; goals: number; assists: number; ratingTotal: number }
  >();
  for (const r of cache.getAll("playerStats")) {
    if (r.season !== game.season || r.cid !== cid) continue;
    const t = stats.get(r.pid) ?? { appearances: 0, goals: 0, assists: 0, ratingTotal: 0 };
    t.appearances += r.appearances;
    t.goals += r.goals;
    t.assists += r.assists;
    t.ratingTotal += r.ratingTotal;
    stats.set(r.pid, t);
  }
  const view = (p: Player, status: SquadPlayerView["status"]): SquadPlayerView => {
    const s = stats.get(p.pid);
    const mood = status === "academy" ? null : moodAtClub(world, p, game.date, levels);
    const at = clubs.get(p.cid ?? -1);
    return {
      pid: p.pid,
      name: fullName(p),
      shirtNumber: p.shirtNumber,
      position: p.position,
      secondary: p.secondaryPositions,
      age: Math.floor(exactAge(p.birthDate, game.date)),
      nationality: p.nationality,
      foot: p.foot,
      ovr: p.ovr,
      pot: p.pot,
      status,
      loan:
        p.loan && status === "loan"
          ? `from ${clubs.get(p.loan.parentCid)?.name ?? "?"} until ${p.loan.until}`
          : p.loan && status === "loanedOut"
            ? `at ${at?.name ?? "?"} until ${p.loan.until}`
            : null,
      condition: Math.round(
        currentCondition(p, game.date, at ? effectiveDials(at).medical : medical),
      ),
      injury:
        p.injury && isInjured(p, game.date) ? { type: p.injury.type, until: p.injury.until } : null,
      wage: p.contract?.wage ?? null,
      expires: p.contract?.expires ?? null,
      expiring: status !== "academy" && yearsLeft(p, game.date) === 1,
      value: marketValue(p, game.date, level),
      mood: mood?.value ?? null,
      season: {
        appearances: s?.appearances ?? 0,
        goals: s?.goals ?? 0,
        assists: s?.assists ?? 0,
        rating:
          s && s.appearances > 0 ? Math.round((s.ratingTotal / s.appearances) * 100) / 100 : null,
      },
    };
  };
  const byPosition = (a: Player, b: Player) =>
    positionOrder(a) - positionOrder(b) || b.ovr - a.ovr || a.pid - b.pid;
  const here = world.players.filter((p) => p.cid === cid);
  const seniors = here.filter(isSenior).sort(byPosition);
  const academy = here.filter((p) => p.status === "academy").sort(byPosition);
  const loanedOut = world.players
    .filter((p) => p.status === "loan" && p.loan?.parentCid === cid)
    .sort(byPosition);
  const fixtures = seasonFixtures(session, game.season);
  const position =
    leagueTables(session, fixtures)
      .flatMap((t) => t.rows)
      .find((r) => r.cid === cid)?.position ?? null;
  const formation = formationById(club.tactics.formation);
  const fit = seniors.filter((p) => !isInjured(p, game.date));
  const xi = fit.length >= 11 ? bestXi(fit, formation).meanOvr : 0;
  const ages = seniors.map((p) => exactAge(p.birthDate, game.date));
  const wageBill = world.players
    .filter((p) => contractClub(p) === cid)
    .reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
  return {
    team: {
      ...teamRef(club),
      leagueId: club.leagueId,
      leagueName:
        competitionsConfig.leagues.find((l) => l.id === club.leagueId)?.name ?? club.leagueId,
      position,
    },
    formation: formation.id,
    strength: Math.round(xi * 10) / 10,
    averageAge: Math.round((ages.reduce((a, b) => a + b, 0) / Math.max(1, ages.length)) * 10) / 10,
    wageBill,
    players: seniors.map((p) => view(p, p.status === "loan" ? "loan" : "club")),
    academy: academy.map((p) => view(p, "academy")),
    loanedOut: loanedOut.map((p) => view(p, "loanedOut")),
  };
}

export async function getPlayer(lid: number, pid: number): Promise<PlayerView> {
  const session = await openLeague(lid);
  const { cache } = session;
  const game = cache.get("meta", "game") as GameMeta;
  const p = cache.get("players", pid) ?? (await session.db.get("players", pid));
  if (!p) throw new Error(`No player ${pid}`);
  const world = loopWorld(session, game.season);
  const clubs = new Map<number, Club>(world.clubs.map((c) => [c.cid, c]));
  const club = clubs.get(p.cid ?? -1);
  const holder = clubs.get(contractClub(p) ?? -1);
  const mood =
    p.status === "club" || p.status === "loan"
      ? moodAtClub(world, p, game.date, clubLevels(world, game.date))
      : null;
  const history = p.ratingsHistory;
  const now = history.at(-1)?.ratings ?? [];
  const before = history.at(-2)?.ratings;
  const ref = (cid: number | null) => (cid === null ? null : teamRef(clubs.get(cid)));
  return {
    pid,
    name: fullName(p),
    position: p.position,
    secondary: p.secondaryPositions,
    age: Math.floor(exactAge(p.birthDate, game.date)),
    birthDate: p.birthDate,
    nationality: p.nationality,
    nationality2: p.nationality2,
    foot: p.foot,
    heightCm: p.heightCm,
    shirtNumber: p.shirtNumber,
    ovr: p.ovr,
    pot: p.pot,
    status: p.status,
    team: club ? teamRef(club) : null,
    loan:
      p.status === "loan" && p.loan && club
        ? {
            at: teamRef(club),
            parent: teamRef(clubs.get(p.loan.parentCid)),
            until: p.loan.until,
            wageShare: p.loan.wageShare,
          }
        : null,
    contract: p.contract
      ? {
          wage: p.contract.wage,
          expires: p.contract.expires,
          yearsLeft: yearsLeft(p, game.date),
          feeRemaining: p.feeBalance?.remaining ?? 0,
        }
      : null,
    value: marketValue(p, game.date, holder ? leagueLevel(world, holder.leagueId, game.date) : 62),
    mood: mood
      ? {
          value: mood.value,
          willing: mood.willing,
          components: mood.components,
          traits: p.moodTraits,
        }
      : null,
    condition: Math.round(currentCondition(p, game.date, club ? effectiveDials(club).medical : 50)),
    injury:
      p.injury && isInjured(p, game.date) ? { type: p.injury.type, until: p.injury.until } : null,
    ratings: RATING_CODES.map((code, i) => ({
      code,
      name: ratingsConfig.ratingNames[code],
      group: ratingsConfig.ratingGroups[code],
      value: Math.round(now[i] ?? 0),
      change: before ? Math.round((now[i] ?? 0) - (before[i] ?? 0)) : null,
    })),
    positionOvrs: POSITIONS.map((position, i) => ({ position, ovr: p.ovrs[i] ?? 0 })),
    transfers: [...p.transfers].reverse().map((t) => ({
      date: t.date,
      type: t.type,
      from: ref(t.fromCid),
      to: ref(t.toCid),
      fee: t.fee,
    })),
    freeAgentSince: p.freeAgentSince,
    retiredSeason: p.retiredSeason,
    history: history.map((h) => ({ date: h.date, season: h.season, ovr: h.ovr, pot: h.pot })),
    radar: Object.entries(ratingsConfig.radarAxes).map(([axis, codes]) => ({
      axis,
      value: Math.round(
        codes.reduce((s, code) => s + (now[RATING_CODES.indexOf(code)] ?? 0), 0) /
          Math.max(1, codes.length),
      ),
    })),
    career: await careerOf(session, pid, game.season, clubs),
  };
}

/** A player's season rows, every club and competition, oldest first (SPEC §10.3). */
async function careerOf(
  session: Awaited<ReturnType<typeof openLeague>>,
  pid: number,
  season: number,
  clubs: ReadonlyMap<number, Club>,
): Promise<PlayerView["career"]> {
  const past = (await session.db.getAllFromIndex("playerStats", "pid", pid)).filter(
    (r) => r.season < season,
  );
  const current = session.cache
    .getAll("playerStats")
    .filter((r) => r.pid === pid && r.season === season);
  const order = (id: string) => {
    const leagues = competitionsConfig.leagues.map((l) => l.id);
    return leagues.includes(id) ? leagues.indexOf(id) : 10;
  };
  return [...past, ...current]
    .sort((a, b) => a.season - b.season || order(a.competition) - order(b.competition))
    .map((r) => ({
      season: r.season,
      club: teamRef(clubs.get(r.cid)),
      competition: r.competition,
      competitionName: competitionName(r.competition),
      appearances: r.appearances,
      starts: r.starts,
      minutes: r.minutes,
      goals: r.goals,
      assists: r.assists,
      rating: r.appearances > 0 ? Math.round((r.ratingTotal / r.appearances) * 100) / 100 : null,
      yellowCards: r.yellowCards,
      redCards: r.redCards,
      cleanSheets: r.cleanSheets,
    }));
}
